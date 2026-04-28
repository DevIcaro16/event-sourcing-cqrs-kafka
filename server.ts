import { meterProvider, tracerProvider } from './src/infrastructure/telemetry/otel'
import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import postgres from 'postgres'
import Redis from 'ioredis'
import { Kafka } from 'kafkajs'
import { PostgresEventStore } from './src/infrastructure/postgres/PostgresEventStore'
import { PostgresIdempotencyStore } from './src/infrastructure/postgres/PostgresIdempotencyStore'
import { PostgresSagaStore } from './src/infrastructure/postgres/PostgresSagaStore'
import { TransferSagaConsumer } from './src/infrastructure/kafka/TransferSagaConsumer'
import { SagaRetryWorker } from './src/infrastructure/kafka/SagaRetryWorker'
import { sagaRoutes } from './src/presentation/routes/sagas'
import { DrizzleReadModelStore } from './src/infrastructure/postgres/read/DrizzleReadModelStore'
import { DrizzleProcessedEventsStore } from './src/infrastructure/postgres/read/DrizzleProcessedEventsStore'
import { RedisSnapshotStore } from './src/infrastructure/redis/RedisSnapshotStore'
import { RedisReadModelCache } from './src/infrastructure/redis/RedisReadModelCache'
import { RedisCacheInvalidator } from './src/infrastructure/redis/RedisCacheInvalidator'
import { RedisCanonicalBalanceCache } from './src/infrastructure/redis/RedisCanonicalBalanceCache'
import { AccountProjector } from './src/application/projectors/AccountProjector'
import { KafkaMessagePublisher } from './src/infrastructure/kafka/KafkaMessagePublisher'
import { KafkaMessageSubscriber } from './src/infrastructure/kafka/KafkaMessageSubscriber'
import { OutboxRelay } from './src/infrastructure/kafka/OutboxRelay'
import { DLQConsumer } from './src/infrastructure/kafka/DLQConsumer'
import { CircuitBreakerPublisher } from './src/infrastructure/kafka/CircuitBreakerPublisher'
import { retryWithBackoff } from './src/infrastructure/kafka/retryWithBackoff'
import { PostgresOutboxStore } from './src/infrastructure/postgres/PostgresOutboxStore'
import { accountRoutes } from './src/presentation/routes/accounts'
import { healthRoutes } from './src/presentation/routes/health'
import { withHttpMetrics } from './src/presentation/middleware/httpMetrics'
import { httpErrorHandler } from './src/presentation/errors/httpErrorHandler'
import { AccountController } from './src/presentation/controllers/AccountController'
import { HealthController } from './src/presentation/controllers/HealthController'
import { SagaController } from './src/presentation/controllers/SagaController'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/banking'
const READ_DATABASE_URL = process.env.READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5434/banking_read'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6381'
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',')
const READ_MODEL_CACHE_TTL = Number(process.env.READ_MODEL_CACHE_TTL ?? 60)
const OUTBOX_POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000)
const PORT = Number(process.env.PORT ?? 3000)

const writeSql = postgres(DATABASE_URL)
const readSql = postgres(READ_DATABASE_URL)
const redis = new Redis(REDIS_URL)
const kafka = new Kafka({
  clientId: 'banking-api',
  brokers: KAFKA_BROKERS,
  logLevel: 1, // WARN — silencia logs INFO do kafkajs
  retry: {
    retries: 20,
    initialRetryTime: 300,
    maxRetryTime: 60_000,
  },
})

const eventStore = new PostgresEventStore(writeSql)
const idempotencyStore = new PostgresIdempotencyStore(writeSql)
const sagaStore = new PostgresSagaStore(writeSql)
const outboxStore = new PostgresOutboxStore(writeSql)
const drizzleReadStore = new DrizzleReadModelStore(readSql)
const processedEventsStore = new DrizzleProcessedEventsStore(readSql)
const snapshotStore = new RedisSnapshotStore(redis)
const cacheInvalidator = new RedisCacheInvalidator(redis)
const canonicalCache = new RedisCanonicalBalanceCache(redis)
const projector = new AccountProjector(drizzleReadStore, cacheInvalidator, processedEventsStore)
const readStoreWithCache = new RedisReadModelCache(drizzleReadStore, redis, READ_MODEL_CACHE_TTL)

const kafkaPublisher = KafkaMessagePublisher.create(kafka, 'banking.account.events')
const dlqPublisher = KafkaMessagePublisher.create(kafka, 'banking.account.events.dlq')
const kafkaSubscriber = KafkaMessageSubscriber.create(kafka, 'banking.account.events', 'banking-projector')

const admin = kafka.admin()
await admin.connect()
const existing = new Set(await admin.listTopics())
const missing = [
  { topic: 'banking.account.events', numPartitions: 1, replicationFactor: 1 },
  { topic: 'banking.account.events.dlq', numPartitions: 1, replicationFactor: 1 },
].filter(t => !existing.has(t.topic))
if (missing.length > 0) {
  await admin.createTopics({ waitForLeaders: true, topics: missing })
}
await admin.disconnect()

await kafkaPublisher.connect()
await dlqPublisher.connect()

const protectedPublisher = new CircuitBreakerPublisher(kafkaPublisher, { threshold: 5, recoveryMs: 30_000 })
const outboxRelay = new OutboxRelay(outboxStore, protectedPublisher, OUTBOX_POLL_INTERVAL_MS)
const dlqConsumer = new DLQConsumer(kafka)

const sagaSubscriber = KafkaMessageSubscriber.create(kafka, 'banking.account.events', 'banking-saga')
const sagaConsumer = new TransferSagaConsumer(sagaStore, eventStore, snapshotStore)
const sagaRetryWorker = new SagaRetryWorker(sagaStore, eventStore, snapshotStore)

const deps = { eventStore, snapshotStore }

const accountController = new AccountController(deps, readStoreWithCache, cacheInvalidator, canonicalCache, idempotencyStore, sagaStore)
const healthController  = new HealthController(writeSql, readSql, redis, kafka)
const sagaController    = new SagaController(sagaStore)

withHttpMetrics(new Elysia())
  .onError(httpErrorHandler)
  .get('/', ({ redirect }) => redirect('/swagger'))
  .use(healthRoutes(healthController))
  .use(accountRoutes(accountController))
  .use(sagaRoutes(sagaController))
  .use(swagger({
    documentation: {
      info: {
        title: 'Banking Event Sourcing API',
        version: '0.3.0',
        description: 'API bancária com Event Sourcing e CQRS. Comandos retornam 202 (async); consultas leem do read model (Redis + Postgres). Projeções via Kafka.',
      },
      tags: [
        { name: 'Accounts', description: 'Operações de conta bancária' },
        { name: 'Health', description: 'Liveness e readiness probes' },
      ],
    },
  }))
  .listen(PORT, () => {
    console.log(`Banking API running on port ${PORT}`)
    console.log(`Swagger UI: http://localhost:${PORT}/swagger`)
    outboxRelay.start()
    sagaRetryWorker.start()
    dlqConsumer.start('banking.account.events.dlq')
  })

// Background Kafka consumer — roda no mesmo processo que o HTTP server
await kafkaSubscriber.subscribe(async (events, aggregateId) => {
  try {
    await retryWithBackoff(
      () => projector.project(events, aggregateId),
      { maxAttempts: 3, baseDelayMs: 500 },
    )
  } catch (err) {
    await dlqPublisher.publish(events, aggregateId)
    console.error('Event sent to DLQ', { aggregateId, err })
  }
})

// Saga consumer — grupo banking-saga, filtra TransferInitiated
await sagaSubscriber.subscribe(async (events) => {
  for (const event of events) {
    if (event.type === 'TransferInitiated') {
      try {
        await sagaConsumer.handleEvent(event)
      } catch (err) {
        console.error('SagaConsumer: erro ao processar TransferInitiated', { err })
      }
    }
  }
})

const shutdown = async () => {
  await outboxRelay.stop()
  await sagaRetryWorker.stop()
  await kafkaSubscriber.close()
  await sagaSubscriber.close()
  await kafkaPublisher.close()
  await dlqPublisher.close()
  await dlqConsumer.close()
  await redis.quit()
  await writeSql.end()
  await readSql.end()
  await meterProvider.shutdown()
  await tracerProvider.shutdown()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

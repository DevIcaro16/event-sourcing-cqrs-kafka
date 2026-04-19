import './src/polyfill/performance'
import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import postgres from 'postgres'
import Redis from 'ioredis'
import { Kafka } from 'kafkajs'
import { PostgresEventStore } from './src/infrastructure/postgres/PostgresEventStore'
import { DrizzleReadModelStore } from './src/infrastructure/postgres/read/DrizzleReadModelStore'
import { RedisSnapshotStore } from './src/infrastructure/redis/RedisSnapshotStore'
import { RedisReadModelCache } from './src/infrastructure/redis/RedisReadModelCache'
import { RedisCacheInvalidator } from './src/infrastructure/redis/RedisCacheInvalidator'
import { AccountProjector } from './src/application/projectors/AccountProjector'
import { KafkaMessagePublisher } from './src/infrastructure/kafka/KafkaMessagePublisher'
import { KafkaMessageSubscriber } from './src/infrastructure/kafka/KafkaMessageSubscriber'
import { retryWithBackoff } from './src/infrastructure/kafka/retryWithBackoff'
import { accountRoutes } from './src/http/routes/accounts'

const DATABASE_URL       = process.env.DATABASE_URL       ?? 'postgres://postgres:postgres@localhost:5432/banking'
const READ_DATABASE_URL  = process.env.READ_DATABASE_URL  ?? 'postgres://postgres:postgres@localhost:5434/banking_read'
const REDIS_URL          = process.env.REDIS_URL          ?? 'redis://localhost:6381'
const KAFKA_BROKERS      = (process.env.KAFKA_BROKERS     ?? 'localhost:9092').split(',')
const READ_MODEL_CACHE_TTL = Number(process.env.READ_MODEL_CACHE_TTL ?? 60)
const PORT               = Number(process.env.PORT        ?? 3000)
const NODE_ENV           = process.env.NODE_ENV           ?? 'development'
const DOCS_USER          = process.env.DOCS_USER
const DOCS_PASSWORD      = process.env.DOCS_PASSWORD

const writeSql = postgres(DATABASE_URL)
const readSql  = postgres(READ_DATABASE_URL)
const redis    = new Redis(REDIS_URL)
const kafka    = new Kafka({
  clientId: 'banking-api',
  brokers: KAFKA_BROKERS,
  logLevel: 1, // WARN — silencia logs INFO do kafkajs
})

const eventStore       = new PostgresEventStore(writeSql)
const drizzleReadStore = new DrizzleReadModelStore(readSql)
const snapshotStore    = new RedisSnapshotStore(redis)
const cacheInvalidator = new RedisCacheInvalidator(redis)
const projector        = new AccountProjector(drizzleReadStore, cacheInvalidator)
const readStoreWithCache = new RedisReadModelCache(drizzleReadStore, redis, READ_MODEL_CACHE_TTL)

const kafkaPublisher  = KafkaMessagePublisher.create(kafka, 'banking.account.events')
const dlqPublisher    = KafkaMessagePublisher.create(kafka, 'banking.account.events.dlq')
const kafkaSubscriber = KafkaMessageSubscriber.create(kafka, 'banking.account.events', 'banking-projector')

// Criar topics se não existirem
const admin = kafka.admin()
await admin.connect()
await admin.createTopics({
  waitForLeaders: true,
  topics: [
    { topic: 'banking.account.events', numPartitions: 1, replicationFactor: 1 },
    { topic: 'banking.account.events.dlq', numPartitions: 1, replicationFactor: 1 },
  ],
}).catch(() => {}) // ignora erro se os topics já existem
await admin.disconnect()

await kafkaPublisher.connect()
await dlqPublisher.connect()

const deps = { eventStore, snapshotStore, publisher: kafkaPublisher }

const docsUser = DOCS_USER
const docsPass = DOCS_PASSWORD

new Elysia()
  .use(accountRoutes(deps, readStoreWithCache))
  .use(NODE_ENV !== 'production'
    ? swagger({
      documentation: {
        info: {
          title: 'Banking Event Sourcing API',
          version: '0.3.0',
          description: 'API bancária com Event Sourcing e CQRS. Comandos retornam 202 (async); consultas leem do read model (Redis + Postgres). Projeções via Kafka.',
        },
        tags: [{ name: 'Accounts', description: 'Operações de conta bancária' }],
      },
    })
    : new Elysia())
  .onRequest(({ request, set }) => {
    if (!docsUser || !docsPass) return
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith('/swagger')) return

    const auth = request.headers.get('authorization') ?? ''
    const spaceIdx = auth.indexOf(' ')
    const scheme = auth.slice(0, spaceIdx)
    const encoded = auth.slice(spaceIdx + 1)

    if (scheme !== 'Basic' || !encoded) {
      set.status = 401
      set.headers['WWW-Authenticate'] = 'Basic realm="API Docs"'
      return 'Unauthorized'
    }

    const decoded = atob(encoded)
    const colonIdx = decoded.indexOf(':')

    if (decoded.slice(0, colonIdx) !== docsUser || decoded.slice(colonIdx + 1) !== docsPass) {
      set.status = 401
      set.headers['WWW-Authenticate'] = 'Basic realm="API Docs"'
      return 'Unauthorized'
    }
  })
  .listen(PORT, () => {
    console.log(`Banking API running on port ${PORT}`)
    if (NODE_ENV !== 'production') {
      console.log(`Swagger UI: http://localhost:${PORT}/swagger`)
    }
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

const shutdown = async () => {
  await kafkaSubscriber.close()
  await kafkaPublisher.close()
  await dlqPublisher.close()
  await redis.quit()
  await writeSql.end()
  await readSql.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

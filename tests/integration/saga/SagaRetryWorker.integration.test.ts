// tests/integration/saga/SagaRetryWorker.integration.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import Redis from 'ioredis'
import { readFileSync } from 'fs'
import { PostgresEventStore } from '../../../src/infrastructure/postgres/PostgresEventStore'
import { PostgresSagaStore } from '../../../src/infrastructure/postgres/PostgresSagaStore'
import { RedisSnapshotStore } from '../../../src/infrastructure/redis/RedisSnapshotStore'
import { SagaRetryWorker } from '../../../src/infrastructure/kafka/SagaRetryWorker'
import { handleOpenAccount } from '../../../src/application/commands/OpenAccount'
import { handleTransfer } from '../../../src/application/commands/Transfer'

const WRITE_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380'

const sql = postgres(WRITE_DB_URL)
const redis = new Redis(REDIS_URL)
const eventStore = new PostgresEventStore(sql)
const snapshotStore = new RedisSnapshotStore(redis)
const sagaStore = new PostgresSagaStore(sql)
const deps = { eventStore, snapshotStore }

beforeAll(async () => {
  await sql.unsafe(readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8'))
})

beforeEach(async () => {
  await sql`TRUNCATE TABLE events, outbox, idempotency_keys, transfer_sagas`
})

afterAll(async () => {
  await sql.end()
  await redis.quit()
})

describe('SagaRetryWorker', () => {
  it('processOnce() completa saga em RETRY quando crédito tem sucesso', async () => {
    const fromId = crypto.randomUUID()
    const toId = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'alice', initialBalance: 1000 }, deps)
    await handleOpenAccount({ accountId: toId, ownerId: 'bob', initialBalance: 500 }, deps)

    const sagaId = crypto.randomUUID()
    await handleTransfer({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 300 }, deps)

    // Colocar saga em RETRY manualmente
    await sagaStore.create({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 300, status: 'RETRY', attempt: 1, nextRetryAt: new Date(Date.now() - 1000) })

    const worker = new SagaRetryWorker(sagaStore, eventStore, snapshotStore, 0)
    await worker.processOnce()

    const saga = await sagaStore.findById(sagaId)
    expect(saga!.status).toBe('COMPLETED')

    const toEvents = await eventStore.load(toId)
    expect(toEvents.some(e => e.type === 'TransferReceived')).toBe(true)
  })

  it('processOnce() agenda próximo retry com backoff quando crédito falha', async () => {
    const fromId = crypto.randomUUID()
    const toId = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'alice', initialBalance: 1000 }, deps)
    await handleOpenAccount({ accountId: toId, ownerId: 'bob', initialBalance: 500 }, deps)

    const sagaId = crypto.randomUUID()
    await handleTransfer({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 300 }, deps)
    await sagaStore.create({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 300, status: 'RETRY', attempt: 1, nextRetryAt: new Date(Date.now() - 1000) })

    const failingEventStore = Object.assign(
      Object.create(Object.getPrototypeOf(eventStore)),
      eventStore,
      { append: async () => { throw new Error('infra error') } },
    ) as typeof eventStore
    const worker = new SagaRetryWorker(sagaStore, failingEventStore, snapshotStore, 0)
    await worker.processOnce()

    const saga = await sagaStore.findById(sagaId)
    expect(saga!.status).toBe('RETRY')
    expect(saga!.attempt).toBe(2)
    expect(saga!.nextRetryAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('compensa automaticamente após esgotar 3 tentativas (attempt >= 2 + retry)', async () => {
    const fromId = crypto.randomUUID()
    const toId = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'alice', initialBalance: 1000 }, deps)
    await handleOpenAccount({ accountId: toId, ownerId: 'bob', initialBalance: 500 }, deps)

    const sagaId = crypto.randomUUID()
    await handleTransfer({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 300 }, deps)

    // attempt=2 é a última tentativa (consumer fez 1, worker fez 2, worker vai fazer 3 e compensar)
    await sagaStore.create({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 300, status: 'RETRY', attempt: 2, nextRetryAt: new Date(Date.now() - 1000) })

    const failingEventStore = Object.assign(
      Object.create(Object.getPrototypeOf(eventStore)),
      eventStore,
      { append: async (aggId: string, aggregateType: string, events: any[], expectedVersion: number) => {
        if (aggId === toId) throw new Error('infra error')
        return eventStore.append(aggId, aggregateType, events, expectedVersion)
      } },
    ) as any

    const worker = new SagaRetryWorker(sagaStore, failingEventStore, snapshotStore, 0)
    await worker.processOnce()

    const saga = await sagaStore.findById(sagaId)
    expect(saga!.status).toBe('FAILED')

    const fromEvents = await eventStore.load(fromId)
    expect(fromEvents.some(e => e.type === 'TransferCompensated')).toBe(true)
  })
})

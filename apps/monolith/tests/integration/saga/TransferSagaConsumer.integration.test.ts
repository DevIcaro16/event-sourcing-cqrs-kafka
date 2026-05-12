// tests/integration/saga/TransferSagaConsumer.integration.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import Redis from 'ioredis'
import { readFileSync } from 'fs'
import { PostgresEventStore } from '../../../src/infrastructure/postgres/PostgresEventStore'
import { PostgresSagaStore } from '../../../src/infrastructure/postgres/PostgresSagaStore'
import { RedisSnapshotStore } from '../../../src/infrastructure/redis/RedisSnapshotStore'
import { TransferSagaConsumer } from '../../../src/infrastructure/kafka/TransferSagaConsumer'
import { handleOpenAccount } from '../../../src/application/commands/OpenAccount'
import { handleTransfer } from '../../../src/application/commands/Transfer'
import type { TransferInitiated } from '../../../src/domain/account/AccountEvents'

const WRITE_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380'

const sql = postgres(WRITE_DB_URL)
const redis = new Redis(REDIS_URL)
const eventStore = new PostgresEventStore(sql)
const snapshotStore = new RedisSnapshotStore(redis)
const sagaStore = new PostgresSagaStore(sql)
const deps = { eventStore, snapshotStore }

const consumer = new TransferSagaConsumer(sagaStore, eventStore, snapshotStore)

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

describe('TransferSagaConsumer', () => {
  it('credita conta destino e marca saga COMPLETED', async () => {
    const fromId = crypto.randomUUID()
    const toId = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'alice', initialBalance: 1000 }, deps)
    await handleOpenAccount({ accountId: toId, ownerId: 'bob', initialBalance: 500 }, deps)

    const sagaId = crypto.randomUUID()
    await handleTransfer({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 300 }, deps)

    // Simula recebimento do evento pelo consumer
    const events = await eventStore.load(fromId)
    const transferEvent = events.find(e => e.type === 'TransferInitiated') as TransferInitiated
    await consumer.handleEvent(transferEvent)

    const saga = await sagaStore.findById(sagaId)
    expect(saga!.status).toBe('COMPLETED')

    const toEvents = await eventStore.load(toId)
    expect(toEvents.some(e => e.type === 'TransferReceived')).toBe(true)
  })

  it('compensa imediatamente se conta destino não existe', async () => {
    const fromId = crypto.randomUUID()
    const nonExistentToId = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'alice', initialBalance: 1000 }, deps)

    const sagaId = crypto.randomUUID()
    await handleTransfer({ sagaId, fromAccountId: fromId, toAccountId: nonExistentToId, amount: 300 }, deps)

    const events = await eventStore.load(fromId)
    const transferEvent = events.find(e => e.type === 'TransferInitiated') as TransferInitiated
    await consumer.handleEvent(transferEvent)

    const saga = await sagaStore.findById(sagaId)
    expect(saga!.status).toBe('FAILED')

    const fromEvents = await eventStore.load(fromId)
    expect(fromEvents.some(e => e.type === 'TransferCompensated')).toBe(true)
  })

  it('é idempotente: processar o mesmo evento duas vezes não duplica crédito', async () => {
    const fromId = crypto.randomUUID()
    const toId = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'alice', initialBalance: 1000 }, deps)
    await handleOpenAccount({ accountId: toId, ownerId: 'bob', initialBalance: 500 }, deps)

    const sagaId = crypto.randomUUID()
    await handleTransfer({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 300 }, deps)

    const events = await eventStore.load(fromId)
    const transferEvent = events.find(e => e.type === 'TransferInitiated') as TransferInitiated
    await consumer.handleEvent(transferEvent)
    await consumer.handleEvent(transferEvent) // segunda vez

    const toEvents = await eventStore.load(toId)
    expect(toEvents.filter(e => e.type === 'TransferReceived')).toHaveLength(1)
  })

  it('agenda RETRY se crédito falha por erro transiente', async () => {
    const fromId = crypto.randomUUID()
    const toId = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'alice', initialBalance: 1000 }, deps)
    await handleOpenAccount({ accountId: toId, ownerId: 'bob', initialBalance: 500 }, deps)

    const sagaId = crypto.randomUUID()
    await handleTransfer({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 300 }, deps)

    // Simula falha transiente usando um eventStore mock que sempre lança erro
    const failingEventStore = {
      ...eventStore,
      append: async () => { throw new Error('infra error') },
    } as any

    const failingConsumer = new TransferSagaConsumer(sagaStore, failingEventStore, snapshotStore)
    const events = await eventStore.load(fromId)
    const transferEvent = events.find(e => e.type === 'TransferInitiated') as TransferInitiated
    await failingConsumer.handleEvent(transferEvent)

    const saga = await sagaStore.findById(sagaId)
    expect(saga!.status).toBe('RETRY')
    expect(saga!.attempt).toBe(1)
    expect(saga!.nextRetryAt).not.toBeNull()
  })
})

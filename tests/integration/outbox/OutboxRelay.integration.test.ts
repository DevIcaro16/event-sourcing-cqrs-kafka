// tests/integration/outbox/OutboxRelay.integration.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import Redis from 'ioredis'
import { readFileSync } from 'fs'
import { PostgresEventStore } from '../../../src/infrastructure/postgres/PostgresEventStore'
import { PostgresOutboxStore } from '../../../src/infrastructure/postgres/PostgresOutboxStore'
import { DrizzleReadModelStore } from '../../../src/infrastructure/postgres/read/DrizzleReadModelStore'
import { DrizzleProcessedEventsStore } from '../../../src/infrastructure/postgres/read/DrizzleProcessedEventsStore'
import { RedisSnapshotStore } from '../../../src/infrastructure/redis/RedisSnapshotStore'
import { RedisCacheInvalidator } from '../../../src/infrastructure/redis/RedisCacheInvalidator'
import { AccountProjector } from '../../../src/application/projectors/AccountProjector'
import { OutboxRelay } from '../../../src/infrastructure/kafka/OutboxRelay'
import type { DomainEvent } from '../../../src/domain/shared/DomainEvent'
import { handleOpenAccount } from '../../../src/application/commands/OpenAccount'
import { handleDeposit } from '../../../src/application/commands/Deposit'

const WRITE_DB_URL = process.env.TEST_DATABASE_URL      ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const READ_DB_URL  = process.env.TEST_READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5435/banking_read_test'
const REDIS_URL    = process.env.TEST_REDIS_URL         ?? 'redis://localhost:6380'

const writeSql = postgres(WRITE_DB_URL)
const readSql  = postgres(READ_DB_URL)
const redis    = new Redis(REDIS_URL)

const eventStore    = new PostgresEventStore(writeSql)
const outboxStore   = new PostgresOutboxStore(writeSql)
const readStore            = new DrizzleReadModelStore(readSql)
const processedEventsStore = new DrizzleProcessedEventsStore(readSql)
const snapshotStore        = new RedisSnapshotStore(redis)
const invalidator          = new RedisCacheInvalidator(redis)
const projector            = new AccountProjector(readStore, invalidator, processedEventsStore)

const deps = { eventStore, snapshotStore }

beforeAll(async () => {
  const writeSchema = readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8')
  const readSchema  = readFileSync('./src/infrastructure/postgres/read/read-schema.sql', 'utf-8')
  await writeSql.unsafe(writeSchema)
  await readSql.unsafe(readSchema)
})

beforeEach(async () => {
  await writeSql`TRUNCATE TABLE events, outbox`
  await readSql`TRUNCATE TABLE account_balances, account_transactions, processed_events`
})

afterAll(async () => {
  await writeSql.end()
  await readSql.end()
  await redis.quit()
})

describe('OutboxRelay — integração', () => {
  it('processOnce() publica entradas pendentes e as marca como published', async () => {
    const accountId = crypto.randomUUID()
    const publisher = {
      async publish(events: DomainEvent[], aggId: string): Promise<void> {
        await projector.project(events, aggId)
      },
    }
    const relay = new OutboxRelay(outboxStore, publisher, 0)

    await handleOpenAccount({ accountId, ownerId: 'owner-1', initialBalance: 500 }, deps)
    await handleDeposit({ accountId, amount: 200 }, deps)

    const pendingBefore = await outboxStore.getPending(100)
    expect(pendingBefore).toHaveLength(2)

    await relay.processOnce()

    const pendingAfter = await outboxStore.getPending(100)
    expect(pendingAfter).toHaveLength(0)

    const rows = await readSql<{ balance: string }[]>`
      SELECT balance FROM account_balances WHERE account_id = ${accountId}::uuid
    `
    expect(Number(rows[0].balance)).toBe(700)
  })

  it('falha no publisher mantém entrada pendente; retry na chamada seguinte republica', async () => {
    const accountId = crypto.randomUUID()
    let shouldFail = true
    const publisher = {
      async publish(events: DomainEvent[], aggId: string): Promise<void> {
        if (shouldFail) throw new Error('publisher indisponível')
        await projector.project(events, aggId)
      },
    }
    const relay = new OutboxRelay(outboxStore, publisher, 0)

    await handleOpenAccount({ accountId, ownerId: 'owner-2', initialBalance: 1000 }, deps)

    await relay.processOnce()
    const pendingAfterFail = await outboxStore.getPending(100)
    expect(pendingAfterFail).toHaveLength(1)

    shouldFail = false
    await relay.processOnce()
    const pendingAfterRetry = await outboxStore.getPending(100)
    expect(pendingAfterRetry).toHaveLength(0)
  })
})

// tests/integration/postgres/PostgresEventStore.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import { PostgresEventStore } from '../../../src/infrastructure/postgres/PostgresEventStore'
import { ConcurrencyError } from '../../../src/application/ports/EventStore'
import { readFileSync } from 'fs'
import type { DomainEvent } from '../../../src/domain/shared/DomainEvent'

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const sql = postgres(TEST_DB_URL)
const store = new PostgresEventStore(sql)

beforeAll(async () => {
  const schema = readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8')
  await sql.unsafe(schema)
})

afterEach(async () => {
  await sql`TRUNCATE TABLE events`
})

afterAll(async () => {
  await sql.end()
})

describe('PostgresEventStore.append + load', () => {
  it('persists events and loads them in order', async () => {
    const aggregateId = crypto.randomUUID()
    const events: DomainEvent[] = [
      { type: 'AccountOpened', accountId: aggregateId, ownerId: 'owner-1', initialBalance: 100, occurredAt: new Date() } as DomainEvent,
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 50, balanceAfter: 150, occurredAt: new Date() } as DomainEvent,
    ]
    await store.append(aggregateId, 'Account', events, 0)
    const loaded = await store.load(aggregateId)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].type).toBe('AccountOpened')
    expect(loaded[1].type).toBe('MoneyDeposited')
  })

  it('assigns sequence_numbers starting at expectedVersion + 1', async () => {
    const aggregateId = crypto.randomUUID()
    await store.append(aggregateId, 'Account', [
      { type: 'AccountOpened', accountId: aggregateId, ownerId: 'o', initialBalance: 0, occurredAt: new Date() } as DomainEvent
    ], 0)
    await store.append(aggregateId, 'Account', [
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 10, balanceAfter: 10, occurredAt: new Date() } as DomainEvent
    ], 1)
    const loaded = await store.load(aggregateId)
    expect(loaded).toHaveLength(2)
  })

  it('throws ConcurrencyError when expectedVersion conflicts', async () => {
    const aggregateId = crypto.randomUUID()
    const event = { type: 'AccountOpened', accountId: aggregateId, ownerId: 'o', initialBalance: 0, occurredAt: new Date() } as DomainEvent
    await store.append(aggregateId, 'Account', [event], 0)
    await expect(
      store.append(aggregateId, 'Account', [{ ...event, occurredAt: new Date() }], 0)
    ).rejects.toThrow(ConcurrencyError)
  })

  it('returns empty array for unknown aggregateId', async () => {
    const events = await store.load(crypto.randomUUID())
    expect(events).toHaveLength(0)
  })

  it('appends multiple events in a single call atomically', async () => {
    const aggregateId = crypto.randomUUID()
    const events: DomainEvent[] = [
      { type: 'AccountOpened', accountId: aggregateId, ownerId: 'o', initialBalance: 0, occurredAt: new Date() } as DomainEvent,
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 100, balanceAfter: 100, occurredAt: new Date() } as DomainEvent,
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 200, balanceAfter: 300, occurredAt: new Date() } as DomainEvent,
    ]
    await store.append(aggregateId, 'Account', events, 0)
    const loaded = await store.load(aggregateId)
    expect(loaded).toHaveLength(3)
  })
})

describe('PostgresEventStore.loadFrom', () => {
  it('carrega eventos a partir de uma sequência específica', async () => {
    const aggregateId = crypto.randomUUID()
    const events: DomainEvent[] = [
      { type: 'AccountOpened', accountId: aggregateId, ownerId: 'o', initialBalance: 0, occurredAt: new Date() } as DomainEvent,
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 100, balanceAfter: 100, occurredAt: new Date() } as DomainEvent,
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 50, balanceAfter: 150, occurredAt: new Date() } as DomainEvent,
    ]
    await store.append(aggregateId, 'Account', events, 0)

    const fromSeq2 = await store.loadFrom(aggregateId, 2)
    expect(fromSeq2).toHaveLength(2)
    expect(fromSeq2[0].type).toBe('MoneyDeposited')

    const fromSeq3 = await store.loadFrom(aggregateId, 3)
    expect(fromSeq3).toHaveLength(1)
    expect(fromSeq3[0].type).toBe('MoneyDeposited')
  })

  it('retorna array vazio se fromSequence é maior que o último evento', async () => {
    const aggregateId = crypto.randomUUID()
    await store.append(aggregateId, 'Account', [
      { type: 'AccountOpened', accountId: aggregateId, ownerId: 'o', initialBalance: 0, occurredAt: new Date() } as DomainEvent,
    ], 0)
    const result = await store.loadFrom(aggregateId, 99)
    expect(result).toHaveLength(0)
  })
})

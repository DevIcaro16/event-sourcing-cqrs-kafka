import { describe, it, expect, beforeAll, afterEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import { DrizzleReadModelStore } from '../../../src/infrastructure/postgres/read/DrizzleReadModelStore'
import { readFileSync } from 'fs'

const TEST_DB_URL = process.env.TEST_READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/banking_read_test'
const sql = postgres(TEST_DB_URL)
const store = new DrizzleReadModelStore(sql)

beforeAll(async () => {
  const schema = readFileSync('./src/infrastructure/postgres/read/read-schema.sql', 'utf-8')
  await sql.unsafe(schema)
})

afterEach(async () => {
  await sql`TRUNCATE TABLE account_transactions`
  await sql`TRUNCATE TABLE account_balances`
})

afterAll(async () => {
  await sql.end()
})

describe('DrizzleReadModelStore.upsertBalance', () => {
  it('insere um novo saldo', async () => {
    const accountId = crypto.randomUUID()
    await store.upsertBalance({
      accountId,
      ownerId: 'owner-1',
      balance: 1000,
      availableBalance: 700,
      lockedBalance: 300,
      lastEventSeq: 1,
    })
    const result = await store.getBalance(accountId)
    expect(result).not.toBeNull()
    expect(result!.balance).toBe(1000)
    expect(result!.availableBalance).toBe(700)
    expect(result!.lockedBalance).toBe(300)
    expect(result!.ownerId).toBe('owner-1')
  })

  it('atualiza um saldo existente (upsert)', async () => {
    const accountId = crypto.randomUUID()
    await store.upsertBalance({ accountId, ownerId: 'o', balance: 500, availableBalance: 500, lockedBalance: 0, lastEventSeq: 1 })
    await store.upsertBalance({ accountId, ownerId: 'o', balance: 800, availableBalance: 800, lockedBalance: 0, lastEventSeq: 2 })
    const result = await store.getBalance(accountId)
    expect(result!.balance).toBe(800)
    expect(result!.lastEventSeq).toBe(2)
  })
})

describe('DrizzleReadModelStore.appendTransaction', () => {
  it('insere uma transação', async () => {
    const accountId = crypto.randomUUID()
    await store.upsertBalance({ accountId, ownerId: 'o', balance: 500, availableBalance: 500, lockedBalance: 0, lastEventSeq: 1 })
    await store.appendTransaction({
      accountId,
      eventType: 'MoneyDeposited',
      amount: 200,
      balanceAfter: 700,
      occurredAt: new Date(),
    })
    const statement = await store.getStatement(accountId, {})
    expect(statement).toHaveLength(1)
    expect(statement[0].eventType).toBe('MoneyDeposited')
    expect(statement[0].amount).toBe(200)
  })
})

describe('DrizzleReadModelStore.getBalance', () => {
  it('retorna null para conta inexistente', async () => {
    const result = await store.getBalance(crypto.randomUUID())
    expect(result).toBeNull()
  })
})

describe('DrizzleReadModelStore.getStatement', () => {
  it('filtra por tipo de evento', async () => {
    const accountId = crypto.randomUUID()
    await store.upsertBalance({ accountId, ownerId: 'o', balance: 500, availableBalance: 500, lockedBalance: 0, lastEventSeq: 1 })
    await store.appendTransaction({ accountId, eventType: 'MoneyDeposited', amount: 100, occurredAt: new Date() })
    await store.appendTransaction({ accountId, eventType: 'MoneyWithdrawn', amount: 50, occurredAt: new Date() })
    const deposits = await store.getStatement(accountId, { type: 'MoneyDeposited' })
    expect(deposits).toHaveLength(1)
    expect(deposits[0].eventType).toBe('MoneyDeposited')
  })

  it('aplica limit e offset', async () => {
    const accountId = crypto.randomUUID()
    await store.upsertBalance({ accountId, ownerId: 'o', balance: 500, availableBalance: 500, lockedBalance: 0, lastEventSeq: 1 })
    for (let i = 0; i < 5; i++) {
      await store.appendTransaction({ accountId, eventType: 'MoneyDeposited', amount: 10, occurredAt: new Date() })
    }
    const page1 = await store.getStatement(accountId, { limit: 2, offset: 0 })
    const page2 = await store.getStatement(accountId, { limit: 2, offset: 2 })
    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(2)
  })
})

// tests/integration/full-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import postgres from 'postgres'
import Redis from 'ioredis'
import { readFileSync } from 'fs'
import { PostgresEventStore } from '../../src/infrastructure/postgres/PostgresEventStore'
import { DrizzleReadModelStore } from '../../src/infrastructure/postgres/read/DrizzleReadModelStore'
import { RedisSnapshotStore } from '../../src/infrastructure/redis/RedisSnapshotStore'
import { RedisReadModelCache } from '../../src/infrastructure/redis/RedisReadModelCache'
import { RedisCacheInvalidator } from '../../src/infrastructure/redis/RedisCacheInvalidator'
import { AccountProjector } from '../../src/application/projectors/AccountProjector'
import { handleOpenAccount } from '../../src/application/commands/OpenAccount'
import { handleDeposit } from '../../src/application/commands/Deposit'
import { handleWithdraw } from '../../src/application/commands/Withdraw'
import { handleLockBalance } from '../../src/application/commands/LockBalance'
import { handleTransfer } from '../../src/application/commands/Transfer'
import { getBalance } from '../../src/application/queries/GetBalance'
import { getStatement } from '../../src/application/queries/GetStatement'

const WRITE_DB_URL = process.env.TEST_DATABASE_URL      ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const READ_DB_URL  = process.env.TEST_READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/banking_read_test'
const REDIS_URL    = process.env.REDIS_URL              ?? 'redis://localhost:6381'

const writeSql = postgres(WRITE_DB_URL)
const readSql  = postgres(READ_DB_URL)
const redis    = new Redis(REDIS_URL)

const eventStore       = new PostgresEventStore(writeSql)
const drizzleReadStore = new DrizzleReadModelStore(readSql)
const snapshotStore    = new RedisSnapshotStore(redis)
const cacheInvalidator = new RedisCacheInvalidator(redis)
const projector        = new AccountProjector(drizzleReadStore, cacheInvalidator)
const readStore        = new RedisReadModelCache(drizzleReadStore, redis, 60)

const deps = { eventStore, snapshotStore, projector }

beforeAll(async () => {
  const writeSchema = readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8')
  const readSchema  = readFileSync('./src/infrastructure/postgres/read/read-schema.sql', 'utf-8')
  await writeSql.unsafe(writeSchema)
  await readSql.unsafe(readSchema)
})

afterAll(async () => {
  await writeSql.end()
  await readSql.end()
  await redis.quit()
})

describe('Fluxo completo: comando → projeção → query', () => {
  it('abre conta e retorna saldo correto via query', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'owner-flow', initialBalance: 1000 }, deps)

    const balance = await getBalance(accountId, readStore)
    expect(balance.balance).toBe(1000)
    expect(balance.availableBalance).toBe(1000)
    expect(balance.lockedBalance).toBe(0)
    expect(balance.ownerId).toBe('owner-flow')
  })

  it('depósito reflete no saldo imediatamente', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 500 }, deps)
    await handleDeposit({ accountId, amount: 300 }, deps)

    const balance = await getBalance(accountId, readStore)
    expect(balance.balance).toBe(800)
    expect(balance.availableBalance).toBe(800)
  })

  it('saque reflete no saldo imediatamente', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 1000 }, deps)
    await handleWithdraw({ accountId, amount: 400 }, deps)

    const balance = await getBalance(accountId, readStore)
    expect(balance.balance).toBe(600)
  })

  it('lock de saldo atualiza available e locked', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 1000 }, deps)
    await handleLockBalance({ accountId, amount: 300, reason: 'garantia' }, deps)

    const balance = await getBalance(accountId, readStore)
    expect(balance.balance).toBe(1000)
    expect(balance.availableBalance).toBe(700)
    expect(balance.lockedBalance).toBe(300)
  })

  it('extrato contém todas as transações da conta', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 500 }, deps)
    await handleDeposit({ accountId, amount: 200 }, deps)
    await handleWithdraw({ accountId, amount: 100 }, deps)

    const statement = await getStatement(accountId, {}, readStore)
    expect(statement.length).toBeGreaterThanOrEqual(3)
    const types = statement.map((t) => t.eventType)
    expect(types).toContain('AccountOpened')
    expect(types).toContain('MoneyDeposited')
    expect(types).toContain('MoneyWithdrawn')
  })

  it('extrato filtra por tipo de evento', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 500 }, deps)
    await handleDeposit({ accountId, amount: 100 }, deps)
    await handleWithdraw({ accountId, amount: 50 }, deps)

    const deposits = await getStatement(accountId, { type: 'MoneyDeposited' }, readStore)
    expect(deposits).toHaveLength(1)
    expect(deposits[0].eventType).toBe('MoneyDeposited')
    expect(deposits[0].amount).toBe(100)
  })

  it('transferência atualiza saldos de ambas as contas', async () => {
    const fromId = crypto.randomUUID()
    const toId   = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'from-owner', initialBalance: 1000 }, deps)
    await handleOpenAccount({ accountId: toId,   ownerId: 'to-owner',   initialBalance: 200  }, deps)
    await handleTransfer({ fromAccountId: fromId, toAccountId: toId, amount: 400 }, deps)

    const fromBalance = await getBalance(fromId, readStore)
    const toBalance   = await getBalance(toId,   readStore)
    expect(fromBalance.balance).toBe(600)
    expect(toBalance.balance).toBe(600)
  })

  it('segundo acesso ao saldo vem do cache Redis (sem bater no DB)', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 750 }, deps)

    const first  = await getBalance(accountId, readStore)
    const cached = await redis.get(`balance:${accountId}`)
    expect(cached).not.toBeNull()

    const second = await getBalance(accountId, readStore)
    expect(second.balance).toBe(first.balance)
  })
})

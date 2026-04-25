// tests/integration/full-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import postgres from 'postgres'
import Redis from 'ioredis'
import { readFileSync } from 'fs'
import { PostgresEventStore } from '../../src/infrastructure/postgres/PostgresEventStore'
import { PostgresOutboxStore } from '../../src/infrastructure/postgres/PostgresOutboxStore'
import { DrizzleReadModelStore } from '../../src/infrastructure/postgres/read/DrizzleReadModelStore'
import { DrizzleProcessedEventsStore } from '../../src/infrastructure/postgres/read/DrizzleProcessedEventsStore'
import { RedisSnapshotStore } from '../../src/infrastructure/redis/RedisSnapshotStore'
import { RedisReadModelCache } from '../../src/infrastructure/redis/RedisReadModelCache'
import { RedisCacheInvalidator } from '../../src/infrastructure/redis/RedisCacheInvalidator'
import { RedisCanonicalBalanceCache } from '../../src/infrastructure/redis/RedisCanonicalBalanceCache'
import { AccountProjector } from '../../src/application/projectors/AccountProjector'
import { OutboxRelay } from '../../src/infrastructure/kafka/OutboxRelay'
import type { DomainEvent } from '../../src/domain/shared/DomainEvent'
import { handleOpenAccount } from '../../src/application/commands/OpenAccount'
import { handleDeposit } from '../../src/application/commands/Deposit'
import { handleWithdraw } from '../../src/application/commands/Withdraw'
import { handleLockBalance } from '../../src/application/commands/LockBalance'
import { handleTransfer } from '../../src/application/commands/Transfer'
import { loadAccount } from '../../src/application/commands/_loadAccount'
import { getBalance } from '../../src/application/queries/GetBalance'
import { getStatement } from '../../src/application/queries/GetStatement'

const WRITE_DB_URL = process.env.TEST_DATABASE_URL      ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const READ_DB_URL  = process.env.TEST_READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5435/banking_read_test'
const REDIS_URL    = process.env.TEST_REDIS_URL         ?? 'redis://localhost:6380'

const writeSql = postgres(WRITE_DB_URL)
const readSql  = postgres(READ_DB_URL)
const redis    = new Redis(REDIS_URL)

const eventStore       = new PostgresEventStore(writeSql)
const outboxStore      = new PostgresOutboxStore(writeSql)
const drizzleReadStore    = new DrizzleReadModelStore(readSql)
const processedEventsStore = new DrizzleProcessedEventsStore(readSql)
const snapshotStore    = new RedisSnapshotStore(redis)
const cacheInvalidator = new RedisCacheInvalidator(redis)
const projector        = new AccountProjector(drizzleReadStore, cacheInvalidator, processedEventsStore)
const readStore        = new RedisReadModelCache(drizzleReadStore, redis, 60)
const canonicalCache   = new RedisCanonicalBalanceCache(redis)
const integrityDeps    = { eventStore, snapshotStore, cacheInvalidator, canonicalCache }

const relayPublisher = {
  async publish(events: DomainEvent[], aggregateId: string): Promise<void> {
    await projector.project(events, aggregateId)
  },
}

const outboxRelay = new OutboxRelay(outboxStore, relayPublisher, 0)
const deps = { eventStore, snapshotStore }

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
    await outboxRelay.processOnce()

    const balance = await getBalance(accountId, readStore, integrityDeps)
    expect(balance.balance).toBe(1000)
    expect(balance.availableBalance).toBe(1000)
    expect(balance.lockedBalance).toBe(0)
    expect(balance.ownerId).toBe('owner-flow')
  })

  it('depósito reflete no saldo imediatamente', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 500 }, deps)
    await handleDeposit({ accountId, amount: 300 }, deps)
    await outboxRelay.processOnce()

    const balance = await getBalance(accountId, readStore, integrityDeps)
    expect(balance.balance).toBe(800)
    expect(balance.availableBalance).toBe(800)
  })

  it('saque reflete no saldo imediatamente', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 1000 }, deps)
    await handleWithdraw({ accountId, amount: 400 }, deps)
    await outboxRelay.processOnce()

    const balance = await getBalance(accountId, readStore, integrityDeps)
    expect(balance.balance).toBe(600)
  })

  it('lock de saldo atualiza available e locked', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 1000 }, deps)
    await handleLockBalance({ accountId, amount: 300, reason: 'garantia' }, deps)
    await outboxRelay.processOnce()

    const balance = await getBalance(accountId, readStore, integrityDeps)
    expect(balance.balance).toBe(1000)
    expect(balance.availableBalance).toBe(700)
    expect(balance.lockedBalance).toBe(300)
  })

  it('extrato contém todas as transações da conta', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 500 }, deps)
    await handleDeposit({ accountId, amount: 200 }, deps)
    await handleWithdraw({ accountId, amount: 100 }, deps)
    await outboxRelay.processOnce()

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
    await outboxRelay.processOnce()

    const deposits = await getStatement(accountId, { type: 'MoneyDeposited' }, readStore)
    expect(deposits).toHaveLength(1)
    expect(deposits[0].eventType).toBe('MoneyDeposited')
    expect(deposits[0].amount).toBe(100)
  })

  it('transferência atualiza saldos de ambas as contas', async () => {
    const fromId = crypto.randomUUID()
    const toId = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'from-owner', initialBalance: 1000 }, deps)
    await handleOpenAccount({ accountId: toId, ownerId: 'to-owner', initialBalance: 500 }, deps)
    await outboxRelay.processOnce()

    // Commita TransferInitiated (apenas débito no remetente)
    const sagaId = crypto.randomUUID()
    await handleTransfer({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 400 }, deps)

    const fromEvents = await deps.eventStore.load(fromId)
    const transferEvent = fromEvents.find(e => e.type === 'TransferInitiated') as import('../../src/domain/account/AccountEvents').TransferInitiated
    expect(transferEvent.sagaId).toBe(sagaId)

    // Simula passo do saga consumer: credita conta destino
    const to = await loadAccount(toId, deps.eventStore, deps.snapshotStore)
    to.receiveTransfer(fromId, 400)
    await deps.eventStore.append(toId, 'Account', to.pendingEvents, to.baseVersion)

    await outboxRelay.processOnce()

    const fromBalance = await getBalance(fromId, readStore, integrityDeps)
    const toBalance = await getBalance(toId, readStore, integrityDeps)

    expect(fromBalance.balance).toBe(600)
    expect(toBalance.balance).toBe(900)
  })

  it('segundo acesso ao saldo vem do cache Redis', async () => {
    const accountId = crypto.randomUUID()
    await handleOpenAccount({ accountId, ownerId: 'o', initialBalance: 750 }, deps)
    await outboxRelay.processOnce()

    const first  = await getBalance(accountId, readStore, integrityDeps)
    const cached = await redis.get(`balance:${accountId}`)
    expect(cached).not.toBeNull()

    const second = await getBalance(accountId, readStore, integrityDeps)
    expect(second.balance).toBe(first.balance)
  })
})

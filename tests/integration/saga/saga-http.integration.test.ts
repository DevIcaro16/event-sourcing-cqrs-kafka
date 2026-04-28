// tests/integration/saga/saga-http.integration.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import Redis from 'ioredis'
import { readFileSync } from 'fs'
import { Elysia } from 'elysia'
import { PostgresEventStore } from '../../../src/infrastructure/postgres/PostgresEventStore'
import { PostgresSagaStore } from '../../../src/infrastructure/postgres/PostgresSagaStore'
import { DrizzleReadModelStore } from '../../../src/infrastructure/postgres/read/DrizzleReadModelStore'
import { RedisSnapshotStore } from '../../../src/infrastructure/redis/RedisSnapshotStore'
import { RedisCacheInvalidator } from '../../../src/infrastructure/redis/RedisCacheInvalidator'
import { RedisCanonicalBalanceCache } from '../../../src/infrastructure/redis/RedisCanonicalBalanceCache'
import { accountRoutes } from '../../../src/presentation/routes/accounts'
import { sagaRoutes } from '../../../src/presentation/routes/sagas'
import { AccountController } from '../../../src/presentation/controllers/AccountController'
import { SagaController } from '../../../src/presentation/controllers/SagaController'
import { httpErrorHandler } from '../../../src/presentation/errors/httpErrorHandler'
import { handleOpenAccount } from '../../../src/application/commands/OpenAccount'

const WRITE_DB_URL = process.env.TEST_DATABASE_URL      ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const READ_DB_URL  = process.env.TEST_READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5435/banking_read_test'
const REDIS_URL    = process.env.TEST_REDIS_URL         ?? 'redis://localhost:6380'

const writeSql = postgres(WRITE_DB_URL)
const readSql  = postgres(READ_DB_URL)
const redis    = new Redis(REDIS_URL)

const eventStore       = new PostgresEventStore(writeSql)
const sagaStore        = new PostgresSagaStore(writeSql)
const readStore        = new DrizzleReadModelStore(readSql)
const snapshotStore    = new RedisSnapshotStore(redis)
const cacheInvalidator = new RedisCacheInvalidator(redis)
const canonicalCache   = new RedisCanonicalBalanceCache(redis)
const deps = { eventStore, snapshotStore }

const accountController = new AccountController(deps, readStore, cacheInvalidator, canonicalCache, undefined, sagaStore)
const sagaController    = new SagaController(sagaStore)

const app = new Elysia()
  .onError(httpErrorHandler)
  .use(accountRoutes(accountController))
  .use(sagaRoutes(sagaController))

beforeAll(async () => {
  await writeSql.unsafe(readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8'))
  await readSql.unsafe(readFileSync('./src/infrastructure/postgres/read/read-schema.sql', 'utf-8'))
})

beforeEach(async () => {
  await writeSql`TRUNCATE TABLE events, outbox, idempotency_keys, transfer_sagas`
})

afterAll(async () => {
  await writeSql.end()
  await readSql.end()
  await redis.quit()
})

describe('POST /accounts/transfer + GET /sagas/:sagaId', () => {
  it('retorna 202 com sagaId e status PENDING', async () => {
    const fromId = crypto.randomUUID()
    const toId   = crypto.randomUUID()

    await handleOpenAccount({ accountId: fromId, ownerId: 'alice', initialBalance: 1000 }, deps)
    await handleOpenAccount({ accountId: toId, ownerId: 'bob', initialBalance: 500 }, deps)

    const res = await app.handle(new Request('http://localhost/accounts/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromAccountId: fromId, toAccountId: toId, amount: 200 }),
    }))

    expect(res.status).toBe(202)
    const body = await res.json() as { sagaId: string; status: string }
    expect(body.sagaId).toBeTruthy()
    expect(body.status).toBe('PENDING')

    const sagaRes = await app.handle(new Request(`http://localhost/sagas/${body.sagaId}`))
    expect(sagaRes.status).toBe(200)
    const sagaBody = await sagaRes.json() as { status: string }
    expect(sagaBody.status).toBe('PENDING')
  })

  it('retorna 404 se conta destino não existe', async () => {
    const fromId = crypto.randomUUID()
    await handleOpenAccount({ accountId: fromId, ownerId: 'alice', initialBalance: 1000 }, deps)

    const res = await app.handle(new Request('http://localhost/accounts/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromAccountId: fromId, toAccountId: crypto.randomUUID(), amount: 100 }),
    }))

    expect(res.status).toBe(404)
  })

  it('GET /sagas/:sagaId retorna 404 para saga inexistente', async () => {
    const res = await app.handle(new Request(`http://localhost/sagas/${crypto.randomUUID()}`))
    expect(res.status).toBe(404)
  })

  it('GET /sagas/:sagaId retorna 200 com campos corretos', async () => {
    // Create a saga record directly to test the endpoint
    const sagaId      = crypto.randomUUID()
    const fromId      = crypto.randomUUID()
    const toId        = crypto.randomUUID()
    await sagaStore.create({ sagaId, fromAccountId: fromId, toAccountId: toId, amount: 150, status: 'COMPLETED', attempt: 0, nextRetryAt: null })

    const res = await app.handle(new Request(`http://localhost/sagas/${sagaId}`))
    expect(res.status).toBe(200)
    const body = await res.json() as { sagaId: string; status: string; amount: number }
    expect(body.sagaId).toBe(sagaId)
    expect(body.status).toBe('COMPLETED')
    expect(body.amount).toBe(150)
  })
})

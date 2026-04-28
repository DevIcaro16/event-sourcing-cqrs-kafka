import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import Redis from 'ioredis'
import { readFileSync } from 'fs'
import { Elysia } from 'elysia'
import { PostgresEventStore } from '../../../src/infrastructure/postgres/PostgresEventStore'
import { PostgresIdempotencyStore } from '../../../src/infrastructure/postgres/PostgresIdempotencyStore'
import { DrizzleReadModelStore } from '../../../src/infrastructure/postgres/read/DrizzleReadModelStore'
import { RedisSnapshotStore } from '../../../src/infrastructure/redis/RedisSnapshotStore'
import { RedisCacheInvalidator } from '../../../src/infrastructure/redis/RedisCacheInvalidator'
import { RedisCanonicalBalanceCache } from '../../../src/infrastructure/redis/RedisCanonicalBalanceCache'
import { accountRoutes } from '../../../src/presentation/routes/accounts'
import { AccountController } from '../../../src/presentation/controllers/AccountController'
import { httpErrorHandler } from '../../../src/presentation/errors/httpErrorHandler'

const WRITE_DB_URL = process.env.TEST_DATABASE_URL      ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const READ_DB_URL  = process.env.TEST_READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5435/banking_read_test'
const REDIS_URL    = process.env.TEST_REDIS_URL         ?? 'redis://localhost:6380'

const writeSql = postgres(WRITE_DB_URL)
const readSql  = postgres(READ_DB_URL)
const redis    = new Redis(REDIS_URL)

const eventStore       = new PostgresEventStore(writeSql)
const idempotencyStore = new PostgresIdempotencyStore(writeSql)
const readStore        = new DrizzleReadModelStore(readSql)
const snapshotStore    = new RedisSnapshotStore(redis)
const cacheInvalidator = new RedisCacheInvalidator(redis)
const canonicalCache   = new RedisCanonicalBalanceCache(redis)

const deps = { eventStore, snapshotStore }

const accountController = new AccountController(deps, readStore, cacheInvalidator, canonicalCache, idempotencyStore)

const app = new Elysia()
  .onError(httpErrorHandler)
  .use(accountRoutes(accountController))

beforeAll(async () => {
  const writeSchema = readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8')
  const readSchema  = readFileSync('./src/infrastructure/postgres/read/read-schema.sql', 'utf-8')
  await writeSql.unsafe(writeSchema)
  await readSql.unsafe(readSchema)
})

beforeEach(async () => {
  await writeSql`TRUNCATE TABLE events, outbox, idempotency_keys`
})

afterAll(async () => {
  await writeSql.end()
  await readSql.end()
  await redis.quit()
})

describe('Idempotência HTTP', () => {
  it('mesmo Idempotency-Key em dois POSTs abre conta apenas uma vez', async () => {
    const key = crypto.randomUUID()
    const body = JSON.stringify({ ownerId: 'alice', initialBalance: 1000 })
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': key }

    const r1 = await app.handle(new Request('http://localhost/accounts', { method: 'POST', headers, body }))
    const r2 = await app.handle(new Request('http://localhost/accounts', { method: 'POST', headers, body }))

    expect(r1.status).toBe(202)
    expect(r2.status).toBe(200)

    const b1 = await r1.json() as { accountId: string }
    const b2 = await r2.json() as { accountId: string; duplicate: boolean }

    expect(b2.duplicate).toBe(true)
    expect(b2.accountId).toBe(b1.accountId)

    const events = await writeSql`SELECT * FROM events`
    expect(events).toHaveLength(1)
  })

  it('sem Idempotency-Key processa normalmente sem duplicate flag', async () => {
    const body = JSON.stringify({ ownerId: 'bob', initialBalance: 500 })
    const headers = { 'Content-Type': 'application/json' }

    const r1 = await app.handle(new Request('http://localhost/accounts', { method: 'POST', headers, body }))
    const b1 = await r1.json()

    expect(r1.status).toBe(202)
    expect(b1).not.toHaveProperty('duplicate')
  })

  it('mesmo Idempotency-Key em rotas diferentes processa ambos', async () => {
    const key = crypto.randomUUID()

    const r1 = await app.handle(new Request('http://localhost/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ ownerId: 'carol', initialBalance: 200 }),
    }))
    const { accountId } = await r1.json() as { accountId: string }

    const r2 = await app.handle(new Request(`http://localhost/accounts/${accountId}/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ amount: 100 }),
    }))
    const b2 = await r2.json()

    expect(r2.status).toBe(202)
    expect(b2).not.toHaveProperty('duplicate')
  })
})

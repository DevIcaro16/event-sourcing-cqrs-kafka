import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { PostgresIdempotencyStore } from '../../../src/infrastructure/postgres/PostgresIdempotencyStore'

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const sql = postgres(DB_URL)
const store = new PostgresIdempotencyStore(sql)

beforeAll(async () => {
  const schema = readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8')
  await sql.unsafe(schema)
})

beforeEach(async () => {
  await sql`TRUNCATE TABLE idempotency_keys`
})

afterAll(async () => {
  await sql.end()
})

describe('PostgresIdempotencyStore', () => {
  it('tryAcquire retorna true na primeira chamada', async () => {
    const result = await store.tryAcquire('key-1', 'POST /accounts/:id/deposit')
    expect(result).toBe(true)
  })

  it('tryAcquire retorna false na segunda chamada com mesma chave+rota', async () => {
    await store.tryAcquire('key-2', 'POST /accounts/:id/deposit')
    const second = await store.tryAcquire('key-2', 'POST /accounts/:id/deposit')
    expect(second).toBe(false)
  })

  it('tryAcquire retorna true para mesma key em rota diferente', async () => {
    await store.tryAcquire('key-3', 'POST /accounts/:id/deposit')
    const other = await store.tryAcquire('key-3', 'POST /accounts/:id/withdraw')
    expect(other).toBe(true)
  })

  it('getResponse retorna null antes de saveResponse', async () => {
    await store.tryAcquire('key-4', 'POST /accounts')
    const result = await store.getResponse('key-4', 'POST /accounts')
    expect(result).toBeNull()
  })

  it('getResponse retorna o response após saveResponse', async () => {
    await store.tryAcquire('key-5', 'POST /accounts')
    await store.saveResponse('key-5', 'POST /accounts', { accountId: 'abc-123' })
    const result = await store.getResponse('key-5', 'POST /accounts')
    expect(result).toEqual({ accountId: 'abc-123' })
  })

  it('getResponse retorna null para chave inexistente', async () => {
    const result = await store.getResponse('nao-existe', 'POST /accounts')
    expect(result).toBeNull()
  })

  it('getResponse retorna null para chave expirada', async () => {
    // Insert a key that is already expired
    await sql`
      INSERT INTO idempotency_keys (key, route, response, expires_at)
      VALUES ('key-expired', 'POST /accounts', '{"accountId":"x"}'::jsonb, NOW() - INTERVAL '1 second')
    `
    const result = await store.getResponse('key-expired', 'POST /accounts')
    expect(result).toBeNull()
  })
})

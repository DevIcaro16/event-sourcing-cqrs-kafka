import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { PostgresSagaStore } from '../../../src/infrastructure/postgres/PostgresSagaStore'

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const sql = postgres(DB_URL)
const store = new PostgresSagaStore(sql)

const makeSaga = (sagaId = crypto.randomUUID()) => ({
  sagaId,
  fromAccountId: crypto.randomUUID(),
  toAccountId: crypto.randomUUID(),
  amount: 100,
  status: 'PENDING' as const,
  attempt: 0,
  nextRetryAt: null,
})

beforeAll(async () => {
  await sql.unsafe(readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8'))
})

beforeEach(async () => {
  await sql`TRUNCATE TABLE transfer_sagas`
})

afterAll(async () => {
  await sql.end()
})

describe('PostgresSagaStore', () => {
  it('create e findById retornam a saga', async () => {
    const saga = makeSaga()
    await store.create(saga)
    const found = await store.findById(saga.sagaId)
    expect(found).not.toBeNull()
    expect(found!.sagaId).toBe(saga.sagaId)
    expect(found!.status).toBe('PENDING')
    expect(found!.amount).toBe(100)
  })

  it('create é idempotente (ON CONFLICT DO NOTHING)', async () => {
    const saga = makeSaga()
    await store.create(saga)
    await store.create(saga) // segunda chamada não deve lançar
    const found = await store.findById(saga.sagaId)
    expect(found!.status).toBe('PENDING')
  })

  it('update altera status, attempt e nextRetryAt', async () => {
    const saga = makeSaga()
    await store.create(saga)
    const retryAt = new Date(Date.now() + 2000)
    await store.update(saga.sagaId, { status: 'RETRY', attempt: 1, nextRetryAt: retryAt })
    const found = await store.findById(saga.sagaId)
    expect(found!.status).toBe('RETRY')
    expect(found!.attempt).toBe(1)
    expect(found!.nextRetryAt).not.toBeNull()
  })

  it('getPendingRetries retorna sagas RETRY com nextRetryAt no passado', async () => {
    const past = makeSaga()
    const future = makeSaga()
    const pastTime = new Date(Date.now() - 1000)
    const futureTime = new Date(Date.now() + 60_000)
    await store.create(past)
    await store.update(past.sagaId, { status: 'RETRY', attempt: 1, nextRetryAt: pastTime })
    await store.create(future)
    await store.update(future.sagaId, { status: 'RETRY', attempt: 1, nextRetryAt: futureTime })
    const pending = await store.getPendingRetries()
    expect(pending.some(s => s.sagaId === past.sagaId)).toBe(true)
    expect(pending.some(s => s.sagaId === future.sagaId)).toBe(false)
  })

  it('findById retorna null para id inexistente', async () => {
    const result = await store.findById(crypto.randomUUID())
    expect(result).toBeNull()
  })
})

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { DrizzleProcessedEventsStore } from '../../../src/infrastructure/postgres/read/DrizzleProcessedEventsStore'

const READ_DB_URL = process.env.TEST_READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5435/banking_read_test'
const sql = postgres(READ_DB_URL)
const store = new DrizzleProcessedEventsStore(sql)

beforeAll(async () => {
  const schema = readFileSync('./src/infrastructure/postgres/read/read-schema.sql', 'utf-8')
  await sql.unsafe(schema)
})

afterEach(async () => {
  await sql`TRUNCATE TABLE processed_events`
})

afterAll(async () => {
  await sql.end()
})

describe('DrizzleProcessedEventsStore', () => {
  it('tryMarkProcessed retorna true para eventId novo', async () => {
    const result = await store.tryMarkProcessed('evt-001')
    expect(result).toBe(true)
  })

  it('tryMarkProcessed retorna false para eventId já processado', async () => {
    await store.tryMarkProcessed('evt-002')
    const second = await store.tryMarkProcessed('evt-002')
    expect(second).toBe(false)
  })

  it('tryMarkProcessed retorna true para eventIds diferentes', async () => {
    const r1 = await store.tryMarkProcessed('evt-003')
    const r2 = await store.tryMarkProcessed('evt-004')
    expect(r1).toBe(true)
    expect(r2).toBe(true)
  })
})

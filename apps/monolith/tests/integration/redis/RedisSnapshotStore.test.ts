import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import Redis from 'ioredis'
import { RedisSnapshotStore } from '../../../src/infrastructure/redis/RedisSnapshotStore'
import type { AccountSnapshot } from '../../../src/application/ports/SnapshotStore'

const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380'
const redis = new Redis(REDIS_URL)
const store = new RedisSnapshotStore(redis)

afterAll(async () => {
  await redis.quit()
})

describe('RedisSnapshotStore', () => {
  it('salva e recupera um snapshot', async () => {
    const accountId = crypto.randomUUID()
    const snapshot: AccountSnapshot = {
      id: accountId,
      ownerId: 'owner-1',
      balance: 1500,
      lockedBalance: 200,
      version: 10,
    }
    await store.save(accountId, snapshot)
    const result = await store.get(accountId)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(accountId)
    expect(result!.balance).toBe(1500)
    expect(result!.lockedBalance).toBe(200)
    expect(result!.version).toBe(10)
  })

  it('retorna null para aggregate inexistente', async () => {
    const result = await store.get(crypto.randomUUID())
    expect(result).toBeNull()
  })

  it('sobrescreve snapshot existente ao salvar novamente', async () => {
    const accountId = crypto.randomUUID()
    await store.save(accountId, { id: accountId, ownerId: 'o', balance: 100, lockedBalance: 0, version: 5 })
    await store.save(accountId, { id: accountId, ownerId: 'o', balance: 999, lockedBalance: 0, version: 20 })
    const result = await store.get(accountId)
    expect(result!.balance).toBe(999)
    expect(result!.version).toBe(20)
  })
})

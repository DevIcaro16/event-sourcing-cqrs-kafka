import type Redis from 'ioredis'
import type { SnapshotStore, AccountSnapshot } from '../../application/ports/SnapshotStore'

export class RedisSnapshotStore implements SnapshotStore {
  constructor(private readonly redis: Redis) {}

  async get(aggregateId: string): Promise<AccountSnapshot | null> {
    const data = await this.redis.get(`snapshot:${aggregateId}`)
    if (!data) return null
    return JSON.parse(data) as AccountSnapshot
  }

  async save(aggregateId: string, snapshot: AccountSnapshot): Promise<void> {
    await this.redis.set(`snapshot:${aggregateId}`, JSON.stringify(snapshot))
  }
}

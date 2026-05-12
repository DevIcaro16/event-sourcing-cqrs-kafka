import type Redis from 'ioredis'
import type { CacheInvalidator } from '../../application/ports/CacheInvalidator'

export class RedisCacheInvalidator implements CacheInvalidator {
  constructor(private readonly redis: Redis) {}

  async invalidateAccount(accountId: string): Promise<void> {
    const statementKeys = await this.scanKeys(`statement:${accountId}:*`)
    const pipeline = this.redis.pipeline()
    pipeline.del(`balance:${accountId}`)
    for (const key of statementKeys) pipeline.del(key)
    await pipeline.exec()
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = []
    let cursor = '0'
    do {
      const [nextCursor, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = nextCursor
      keys.push(...batch)
    } while (cursor !== '0')
    return keys
  }
}

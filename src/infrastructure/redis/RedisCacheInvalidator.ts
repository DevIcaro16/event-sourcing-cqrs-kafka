import type Redis from 'ioredis'
import type { CacheInvalidator } from '../../application/ports/CacheInvalidator'

export class RedisCacheInvalidator implements CacheInvalidator {
  constructor(private readonly redis: Redis) {}

  async invalidateAccount(accountId: string): Promise<void> {
    const statementKeys = await this.redis.keys(`statement:${accountId}:*`)
    const pipeline = this.redis.pipeline()
    pipeline.del(`balance:${accountId}`)
    for (const key of statementKeys) {
      pipeline.del(key)
    }
    await pipeline.exec()
  }
}

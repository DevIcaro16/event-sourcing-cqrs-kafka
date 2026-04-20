import type Redis from 'ioredis'
import type { CanonicalBalance, CanonicalBalanceCache } from '../../application/ports/CanonicalBalanceCache'

const TTL_SECONDS = 300

export class RedisCanonicalBalanceCache implements CanonicalBalanceCache {
  constructor(private readonly redis: Redis) {}

  async get(accountId: string, seq: number): Promise<CanonicalBalance | null> {
    const raw = await this.redis.get(`canonical:${accountId}:${seq}`)
    return raw ? (JSON.parse(raw) as CanonicalBalance) : null
  }

  async set(accountId: string, seq: number, value: CanonicalBalance): Promise<void> {
    await this.redis.set(`canonical:${accountId}:${seq}`, JSON.stringify(value), 'EX', TTL_SECONDS)
  }
}

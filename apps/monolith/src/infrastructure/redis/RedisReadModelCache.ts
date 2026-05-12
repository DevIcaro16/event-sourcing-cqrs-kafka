import { createHash } from 'crypto'
import type Redis from 'ioredis'
import type { ReadModelStore, AccountBalanceData, AccountTransactionData, StatementFilters } from '../../application/ports/ReadModelStore'

export class RedisReadModelCache implements ReadModelStore {
  constructor(
    private readonly origin: ReadModelStore,
    private readonly redis: Redis,
    private readonly ttl: number,
  ) {}

  async upsertBalance(data: AccountBalanceData): Promise<void> {
    return this.origin.upsertBalance(data)
  }

  async appendTransaction(data: AccountTransactionData): Promise<void> {
    return this.origin.appendTransaction(data)
  }

  async getBalance(accountId: string): Promise<AccountBalanceData | null> {
    const key = `balance:${accountId}`
    const cached = await this.redis.get(key)
    if (cached) return JSON.parse(cached) as AccountBalanceData
    const result = await this.origin.getBalance(accountId)
    if (result) await this.redis.set(key, JSON.stringify(result), 'EX', this.ttl)
    return result
  }

  async getStatement(accountId: string, filters: StatementFilters): Promise<AccountTransactionData[]> {
    const paramsHash = createHash('md5').update(JSON.stringify(filters)).digest('hex')
    const key = `statement:${accountId}:${paramsHash}`
    const cached = await this.redis.get(key)
    if (cached) {
      return (JSON.parse(cached) as AccountTransactionData[]).map((item) => ({
        ...item,
        occurredAt: new Date(item.occurredAt as unknown as string),
      }))
    }
    const result = await this.origin.getStatement(accountId, filters)
    if (result.length > 0) await this.redis.set(key, JSON.stringify(result), 'EX', this.ttl)
    return result
  }
}

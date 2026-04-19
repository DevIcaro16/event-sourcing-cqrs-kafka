import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, and, gte, lte } from 'drizzle-orm'
import type postgres from 'postgres'
import { accountBalances, accountTransactions } from './schema'
import type { ReadModelStore, AccountBalanceData, AccountTransactionData, StatementFilters } from '../../../application/ports/ReadModelStore'

export class DrizzleReadModelStore implements ReadModelStore {
  private readonly db: ReturnType<typeof drizzle>

  constructor(sql: postgres.Sql) {
    this.db = drizzle(sql)
  }

  async upsertBalance(data: AccountBalanceData): Promise<void> {
    await this.db
      .insert(accountBalances)
      .values({
        accountId:        data.accountId,
        ownerId:          data.ownerId,
        balance:          String(data.balance),
        availableBalance: String(data.availableBalance),
        lockedBalance:    String(data.lockedBalance),
        lastEventSeq:     data.lastEventSeq,
        updatedAt:        new Date(),
      })
      .onConflictDoUpdate({
        target: accountBalances.accountId,
        set: {
          ownerId:          data.ownerId,
          balance:          String(data.balance),
          availableBalance: String(data.availableBalance),
          lockedBalance:    String(data.lockedBalance),
          lastEventSeq:     data.lastEventSeq,
          updatedAt:        new Date(),
        },
      })
  }

  async appendTransaction(data: AccountTransactionData): Promise<void> {
    await this.db.insert(accountTransactions).values({
      accountId:    data.accountId,
      eventType:    data.eventType,
      amount:       data.amount != null ? String(data.amount) : null,
      balanceAfter: data.balanceAfter != null ? String(data.balanceAfter) : null,
      description:  data.description ?? null,
      occurredAt:   data.occurredAt,
    })
  }

  async getBalance(accountId: string): Promise<AccountBalanceData | null> {
    const rows = await this.db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.accountId, accountId))
    if (rows.length === 0) return null
    const row = rows[0]
    return {
      accountId:        row.accountId,
      ownerId:          row.ownerId,
      balance:          Number(row.balance),
      availableBalance: Number(row.availableBalance),
      lockedBalance:    Number(row.lockedBalance),
      lastEventSeq:     row.lastEventSeq,
    }
  }

  async getStatement(accountId: string, filters: StatementFilters): Promise<AccountTransactionData[]> {
    const conditions = [eq(accountTransactions.accountId, accountId)]
    if (filters.from) conditions.push(gte(accountTransactions.occurredAt, filters.from))
    if (filters.to)   conditions.push(lte(accountTransactions.occurredAt, filters.to))
    if (filters.type) conditions.push(eq(accountTransactions.eventType, filters.type))

    const rows = await this.db
      .select()
      .from(accountTransactions)
      .where(and(...conditions))
      .orderBy(accountTransactions.occurredAt)
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0)

    return rows.map((row) => ({
      accountId:    row.accountId,
      eventType:    row.eventType,
      amount:       row.amount != null ? Number(row.amount) : undefined,
      balanceAfter: row.balanceAfter != null ? Number(row.balanceAfter) : undefined,
      description:  row.description ?? undefined,
      occurredAt:   row.occurredAt,
    }))
  }
}

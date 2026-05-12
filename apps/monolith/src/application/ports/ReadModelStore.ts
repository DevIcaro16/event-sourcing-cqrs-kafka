export type AccountBalanceData = {
  accountId: string
  ownerId: string
  balance: number
  availableBalance: number
  lockedBalance: number
  lastEventSeq: number
}

export type AccountTransactionData = {
  accountId: string
  eventType: string
  amount?: number
  balanceAfter?: number
  description?: string
  occurredAt: Date
}

export type StatementFilters = {
  from?: Date
  to?: Date
  type?: string
  limit?: number
  offset?: number
}

export interface ReadModelStore {
  upsertBalance(data: AccountBalanceData): Promise<void>
  appendTransaction(data: AccountTransactionData): Promise<void>
  getBalance(accountId: string): Promise<AccountBalanceData | null>
  getStatement(accountId: string, filters: StatementFilters): Promise<AccountTransactionData[]>
}

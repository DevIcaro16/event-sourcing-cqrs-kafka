// src/application/queries/GetStatement.ts
import type { ReadModelStore, AccountTransactionData, StatementFilters } from '../ports/ReadModelStore'

export async function getStatement(
  accountId: string,
  filters: StatementFilters,
  readStore: ReadModelStore,
): Promise<AccountTransactionData[]> {
  return readStore.getStatement(accountId, filters)
}

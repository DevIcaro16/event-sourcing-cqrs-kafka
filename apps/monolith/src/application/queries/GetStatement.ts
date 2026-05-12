// src/application/queries/GetStatement.ts
import type { ReadModelStore, AccountTransactionData, StatementFilters } from '../ports/ReadModelStore'
import { AccountNotFoundError } from '../../domain/account/AccountErrors'

export async function getStatement(
  accountId: string,
  filters: StatementFilters,
  readStore: ReadModelStore,
): Promise<AccountTransactionData[]> {
  const balance = await readStore.getBalance(accountId)
  if (!balance) throw new AccountNotFoundError(accountId)
  return readStore.getStatement(accountId, filters)
}

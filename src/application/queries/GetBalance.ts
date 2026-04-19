// src/application/queries/GetBalance.ts
import type { ReadModelStore, AccountBalanceData } from '../ports/ReadModelStore'
import { AccountNotFoundError } from '../../domain/account/AccountErrors'

export async function getBalance(
  accountId: string,
  readStore: ReadModelStore,
): Promise<AccountBalanceData> {
  const balance = await readStore.getBalance(accountId)
  if (!balance) throw new AccountNotFoundError(accountId)
  return balance
}

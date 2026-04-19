// src/application/queries/GetBalance.ts
import type { ReadModelStore, AccountBalanceData } from '../ports/ReadModelStore'

export async function getBalance(
  accountId: string,
  readStore: ReadModelStore,
): Promise<AccountBalanceData> {
  const balance = await readStore.getBalance(accountId)
  if (!balance) throw new Error(`Account not found: ${accountId}`)
  return balance
}

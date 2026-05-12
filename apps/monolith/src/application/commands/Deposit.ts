import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '@domain/account/AccountErrors'
import { METRIC_TRANSACTIONS_TOTAL, METRIC_TRANSACTION_AMOUNT } from '../constants/metricNames'

export type DepositCommand = {
  accountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleDeposit(
  command: DepositCommand,
  deps: CommandDeps,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const account = await loadAccount(command.accountId, deps.eventStore, deps.snapshotStore)
    account.deposit(command.amount)
    try {
      await deps.eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      deps.metrics?.increment(METRIC_TRANSACTIONS_TOTAL, { type: 'deposit' })
      deps.metrics?.record(METRIC_TRANSACTION_AMOUNT, command.amount, { type: 'deposit' })
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

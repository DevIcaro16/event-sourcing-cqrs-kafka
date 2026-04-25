import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '../ports/EventStore'
import { transactionsTotal, transactionAmount } from '../../infrastructure/telemetry/metrics'

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
      transactionsTotal.add(1, { type: 'deposit' })
      transactionAmount.record(command.amount, { type: 'deposit' })
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

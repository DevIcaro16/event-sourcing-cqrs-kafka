import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '@domain/account/AccountErrors'
import { METRIC_TRANSACTIONS_TOTAL, METRIC_TRANSACTION_AMOUNT } from '../constants/metricNames'

export type TransferCommand = {
  sagaId: string
  fromAccountId: string
  toAccountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleTransfer(
  command: TransferCommand,
  deps: CommandDeps,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const from = await loadAccount(command.fromAccountId, deps.eventStore, deps.snapshotStore)
    from.initiateTransfer(command.toAccountId, command.amount, command.sagaId)
    try {
      await deps.eventStore.append(command.fromAccountId, 'Account', from.pendingEvents, from.baseVersion)
      deps.metrics?.increment(METRIC_TRANSACTIONS_TOTAL, { type: 'transfer' })
      deps.metrics?.record(METRIC_TRANSACTION_AMOUNT, command.amount, { type: 'transfer' })
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

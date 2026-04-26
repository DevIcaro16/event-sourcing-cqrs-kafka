import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '../ports/EventStore'
import { transactionsTotal, transactionAmount } from '../../infrastructure/telemetry/metrics'

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
      transactionsTotal.add(1, { type: 'transfer' })
      transactionAmount.record(command.amount, { type: 'transfer' })
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

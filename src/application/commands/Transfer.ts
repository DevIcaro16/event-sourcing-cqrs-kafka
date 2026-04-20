// src/application/commands/Transfer.ts
import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '../ports/EventStore'
import { transactionsTotal, transactionAmount } from '../../infrastructure/telemetry/metrics'

export type TransferCommand = {
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
    const [from, to] = await Promise.all([
      loadAccount(command.fromAccountId, deps.eventStore, deps.snapshotStore),
      loadAccount(command.toAccountId, deps.eventStore, deps.snapshotStore),
    ])
    from.initiateTransfer(command.toAccountId, command.amount)
    to.receiveTransfer(command.fromAccountId, command.amount)
    try {
      await deps.eventStore.append(command.fromAccountId, 'Account', from.pendingEvents, from.baseVersion)
      await deps.eventStore.append(command.toAccountId, 'Account', to.pendingEvents, to.baseVersion)
      await deps.publisher.publish(from.pendingEvents, command.fromAccountId)
      await deps.publisher.publish(to.pendingEvents, command.toAccountId)
      transactionsTotal.add(1, { type: 'transfer' })
      transactionAmount.record(command.amount, { type: 'transfer' })
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '../ports/EventStore'
import { InvalidReversalError } from '../../domain/account/AccountErrors'
import { transactionsTotal } from '../../infrastructure/telemetry/metrics'

export type ReverseTransactionCommand = {
  accountId: string
  originalEventId: string
}

const MAX_RETRIES = 3

export async function handleReverseTransaction(
  command: ReverseTransactionCommand,
  deps: CommandDeps,
): Promise<void> {
  const originalEvent = await deps.eventStore.findEventById(command.originalEventId, command.accountId)
  if (!originalEvent) {
    throw new InvalidReversalError(`event ${command.originalEventId} not found for account ${command.accountId}`)
  }
  if (originalEvent.type !== 'MoneyDeposited' && originalEvent.type !== 'MoneyWithdrawn') {
    throw new InvalidReversalError(`event ${command.originalEventId} has type '${originalEvent.type}' which is not reversible`)
  }
  const amount = (originalEvent as any).amount as number | undefined
  if (!amount || amount <= 0) {
    throw new InvalidReversalError(`event ${command.originalEventId} has no reversible amount`)
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const account = await loadAccount(command.accountId, deps.eventStore, deps.snapshotStore)
    account.reverseTransaction(command.originalEventId, amount, originalEvent.type)
    try {
      await deps.eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      transactionsTotal.add(1, { type: 'reverse' })
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

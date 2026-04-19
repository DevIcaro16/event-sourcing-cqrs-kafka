// src/application/commands/ReverseTransaction.ts
import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '../ports/EventStore'
import { InvalidReversalError } from '../../domain/account/AccountErrors'

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
  const amount = (originalEvent as any).amount as number | undefined
  if (!amount || amount <= 0) {
    throw new InvalidReversalError(`event ${command.originalEventId} has no reversible amount`)
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const account = await loadAccount(command.accountId, deps.eventStore, deps.snapshotStore)
    account.reverseTransaction(command.originalEventId, amount)
    try {
      await deps.eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      await deps.publisher.publish(account.pendingEvents, command.accountId)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

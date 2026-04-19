// src/application/commands/ReverseTransaction.ts
import type { EventStore } from '../ports/EventStore'
import { ConcurrencyError } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type ReverseTransactionCommand = {
  accountId: string
  originalEventId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleReverseTransaction(
  command: ReverseTransactionCommand,
  eventStore: EventStore
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const history = await eventStore.load(command.accountId)
    if (history.length === 0) throw new Error(`Account not found: ${command.accountId}`)

    const account = new Account()
    account.loadFromHistory(history)
    account.reverseTransaction(command.originalEventId, command.amount)

    try {
      await eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

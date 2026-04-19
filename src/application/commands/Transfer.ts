// src/application/commands/Transfer.ts
import type { EventStore } from '../ports/EventStore'
import { ConcurrencyError } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type TransferCommand = {
  fromAccountId: string
  toAccountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleTransfer(
  command: TransferCommand,
  eventStore: EventStore
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const [fromHistory, toHistory] = await Promise.all([
      eventStore.load(command.fromAccountId),
      eventStore.load(command.toAccountId),
    ])
    if (fromHistory.length === 0) throw new Error(`Account not found: ${command.fromAccountId}`)
    if (toHistory.length === 0) throw new Error(`Account not found: ${command.toAccountId}`)

    const from = new Account()
    from.loadFromHistory(fromHistory)
    from.initiateTransfer(command.toAccountId, command.amount)

    const to = new Account()
    to.loadFromHistory(toHistory)
    to.receiveTransfer(command.fromAccountId, command.amount)

    try {
      await eventStore.append(command.fromAccountId, 'Account', from.pendingEvents, from.baseVersion)
      await eventStore.append(command.toAccountId, 'Account', to.pendingEvents, to.baseVersion)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

// src/application/commands/OpenAccount.ts
import type { EventStore } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type OpenAccountCommand = {
  accountId: string
  ownerId: string
  initialBalance: number
}

export async function handleOpenAccount(
  command: OpenAccountCommand,
  eventStore: EventStore
): Promise<void> {
  const account = Account.open(command.accountId, command.ownerId, command.initialBalance)
  await eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
}

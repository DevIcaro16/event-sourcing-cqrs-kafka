// src/application/commands/OpenAccount.ts
import type { CommandDeps } from './_loadAccount'
import { Account } from '../../domain/account/Account'

export type OpenAccountCommand = {
  accountId: string
  ownerId: string
  initialBalance: number
}

export async function handleOpenAccount(
  command: OpenAccountCommand,
  deps: CommandDeps,
): Promise<void> {
  const account = Account.open(command.accountId, command.ownerId, command.initialBalance)
  await deps.eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
  await deps.projector.project(account.pendingEvents, command.accountId)
}

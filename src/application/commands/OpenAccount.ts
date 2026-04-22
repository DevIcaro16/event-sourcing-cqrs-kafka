import type { CommandDeps } from './_loadAccount'
import { Account } from '../../domain/account/Account'
import { accountsOpenedTotal } from '../../infrastructure/telemetry/metrics'

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
  accountsOpenedTotal.add(1)
}

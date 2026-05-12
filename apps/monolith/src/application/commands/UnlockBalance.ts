import { ConcurrencyError } from '@domain/account/AccountErrors'
import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'

export type UnlockBalanceCommand = {
  accountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleUnlockBalance(
  command: UnlockBalanceCommand,
  deps: CommandDeps,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const account = await loadAccount(command.accountId, deps.eventStore, deps.snapshotStore)
    account.unlockBalance(command.amount)
    try {
      await deps.eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

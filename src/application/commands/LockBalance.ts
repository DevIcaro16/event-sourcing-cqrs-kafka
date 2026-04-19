// src/application/commands/LockBalance.ts
import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '../ports/EventStore'

export type LockBalanceCommand = {
  accountId: string
  amount: number
  reason: string
}

const MAX_RETRIES = 3

export async function handleLockBalance(
  command: LockBalanceCommand,
  deps: CommandDeps,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const account = await loadAccount(command.accountId, deps.eventStore, deps.snapshotStore)
    account.lockBalance(command.amount, command.reason)
    try {
      await deps.eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      await deps.projector.project(account.pendingEvents, command.accountId)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

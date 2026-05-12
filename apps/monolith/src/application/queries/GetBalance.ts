// src/application/queries/GetBalance.ts
import type { ReadModelStore, AccountBalanceData } from '../ports/ReadModelStore'
import type { EventStore } from '../ports/EventStore'
import type { SnapshotStore } from '../ports/SnapshotStore'
import type { CacheInvalidator } from '../ports/CacheInvalidator'
import type { CanonicalBalanceCache } from '../ports/CanonicalBalanceCache'
import { AccountNotFoundError } from '../../domain/account/AccountErrors'
import { loadAccount } from '../commands/_loadAccount'

export type BalanceIntegrityDeps = {
  eventStore: EventStore
  snapshotStore: SnapshotStore
  cacheInvalidator: CacheInvalidator
  canonicalCache: CanonicalBalanceCache
}

export async function getBalance(
  accountId: string,
  readStore: ReadModelStore,
  integrityDeps: BalanceIntegrityDeps,
): Promise<AccountBalanceData> {
  const stored = await readStore.getBalance(accountId)
  if (!stored) throw new AccountNotFoundError(accountId)

  const latestSeq = await integrityDeps.eventStore.getLatestSequence(accountId)

  let canonical = await integrityDeps.canonicalCache.get(accountId, latestSeq)
  if (!canonical) {
    canonical = await integrityDeps.eventStore.computeCanonicalBalance(accountId)
    if (canonical) await integrityDeps.canonicalCache.set(accountId, latestSeq, canonical)
  }

  if (
    canonical &&
    (stored.balance !== canonical.balance || stored.lockedBalance !== canonical.lockedBalance)
  ) {
    console.warn(
      `[integrity] drift detected for account ${accountId}: ` +
      `stored=(balance=${stored.balance}, locked=${stored.lockedBalance}) ` +
      `canonical=(balance=${canonical.balance}, locked=${canonical.lockedBalance}) — rebuilding`,
    )

    const account = await loadAccount(accountId, integrityDeps.eventStore, integrityDeps.snapshotStore)

    const corrected: AccountBalanceData = {
      accountId: account.id,
      ownerId: account.ownerId,
      balance: account.balance,
      availableBalance: account.availableBalance,
      lockedBalance: account.lockedBalance,
      lastEventSeq: latestSeq,
    }

    await readStore.upsertBalance(corrected)
    await integrityDeps.cacheInvalidator.invalidateAccount(accountId)
    console.warn(`[integrity] read model corrected for account ${accountId}`)
    return corrected
  }

  return stored
}

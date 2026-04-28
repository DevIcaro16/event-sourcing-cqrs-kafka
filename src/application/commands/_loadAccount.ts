import { Account } from '../../domain/account/Account'
import { AccountNotFoundError } from '../../domain/account/AccountErrors'
import type { EventStore } from '../ports/EventStore'
import type { SnapshotStore } from '../ports/SnapshotStore'
import type { MetricsPort } from '../ports/MetricsPort'

const SNAPSHOT_THRESHOLD = Number(process.env.SNAPSHOT_THRESHOLD ?? 50)

export type CommandDeps = {
  eventStore: EventStore
  snapshotStore: SnapshotStore
  metrics?: MetricsPort
}

export async function loadAccount(
  accountId: string,
  eventStore: EventStore,
  snapshotStore: SnapshotStore,
): Promise<Account> {
  const snapshot = await snapshotStore.get(accountId)
  if (snapshot) {
    const account = Account.fromSnapshot(snapshot)
    const recentEvents = await eventStore.loadFrom(accountId, snapshot.version + 1)
    account.loadFromHistory(recentEvents)
    return account
  }
  const allEvents = await eventStore.load(accountId)
  if (allEvents.length === 0) throw new AccountNotFoundError(accountId)
  const account = new Account()
  account.loadFromHistory(allEvents)
  if (account.version >= SNAPSHOT_THRESHOLD) {
    await snapshotStore.save(accountId, account.toSnapshot())
  }
  return account
}

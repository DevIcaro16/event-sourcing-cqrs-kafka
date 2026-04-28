import type { AccountSnapshot } from '../../domain/account/Account'

export type { AccountSnapshot }

export interface SnapshotStore {
  get(aggregateId: string): Promise<AccountSnapshot | null>
  save(aggregateId: string, snapshot: AccountSnapshot): Promise<void>
}

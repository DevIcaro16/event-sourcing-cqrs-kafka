export type AccountSnapshot = {
  id: string
  ownerId: string
  balance: number
  lockedBalance: number
  version: number
}

export interface SnapshotStore {
  get(aggregateId: string): Promise<AccountSnapshot | null>
  save(aggregateId: string, snapshot: AccountSnapshot): Promise<void>
}

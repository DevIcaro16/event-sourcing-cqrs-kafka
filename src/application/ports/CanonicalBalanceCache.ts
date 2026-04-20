export type CanonicalBalance = {
  balance: number
  lockedBalance: number
}

export interface CanonicalBalanceCache {
  get(accountId: string, seq: number): Promise<CanonicalBalance | null>
  set(accountId: string, seq: number, value: CanonicalBalance): Promise<void>
}

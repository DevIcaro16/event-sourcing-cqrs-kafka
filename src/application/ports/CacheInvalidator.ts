export interface CacheInvalidator {
  invalidateAccount(accountId: string): Promise<void>
}

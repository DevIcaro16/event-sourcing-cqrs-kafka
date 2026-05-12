export interface IdempotencyStore {
  tryAcquire(key: string, route: string): Promise<boolean>
  getResponse(key: string, route: string): Promise<Record<string, unknown> | null>
  saveResponse(key: string, route: string, response: Record<string, unknown>): Promise<void>
}

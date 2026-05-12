import type { IdempotencyStore } from '../../application/ports/IdempotencyStore'

export async function withIdempotency<T extends Record<string, unknown>>(
  key: string | undefined,
  route: string,
  store: IdempotencyStore | undefined,
  handler: () => Promise<T>,
): Promise<T & { duplicate?: true }> {
  if (!key || !store) return handler()

  const acquired = await store.tryAcquire(key, route)
  if (!acquired) {
    const cached = await store.getResponse(key, route)
    if (cached) return { ...(cached as T), duplicate: true as const }
    return handler()
  }

  const result = await handler()
  await store.saveResponse(key, route, result)
  return result
}

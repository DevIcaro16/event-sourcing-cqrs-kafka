export async function retryWithBackoff(
  fn: () => Promise<void>,
  { maxAttempts, baseDelayMs }: { maxAttempts: number; baseDelayMs: number },
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts) throw err
      await Bun.sleep(baseDelayMs * 2 ** (attempt - 1))
    }
  }
}

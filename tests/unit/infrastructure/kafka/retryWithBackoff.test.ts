import { describe, it, expect, mock } from 'bun:test'
import { retryWithBackoff } from '../../../../src/infrastructure/kafka/retryWithBackoff'

describe('retryWithBackoff', () => {
  it('resolve imediatamente se a função não lança erro', async () => {
    const fn = mock(async () => {})
    await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 0 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retenta até maxAttempts e relança o último erro', async () => {
    const err = new Error('falha')
    const fn = mock(async () => { throw err })
    await expect(retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('falha')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('para de retentar assim que a função resolver', async () => {
    let calls = 0
    const fn = mock(async () => {
      calls++
      if (calls < 2) throw new Error('ainda não')
    })
    await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 0 })
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

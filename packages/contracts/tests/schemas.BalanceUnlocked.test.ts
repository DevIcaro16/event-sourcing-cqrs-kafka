import { describe, it, expect } from 'bun:test'
import { createAjv } from '../src/validation/ajv'
import { BalanceUnlockedSchema } from '../src/schemas/v1/BalanceUnlocked.schema'

describe('BalanceUnlocked schema v1', () => {
  const ajv = createAjv()
  const validate = ajv.compile(BalanceUnlockedSchema)

  it('accepts a valid payload', () => {
    const valid = {
      type: 'BalanceUnlocked',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 30,
    }
    expect(validate(valid)).toBe(true)
  })

  it('rejects when a required field is missing', () => {
    const invalid = {
      type: 'BalanceUnlocked',
      occurredAt: '2026-05-12T00:00:00.000Z',
      amount: 30,
    }
    expect(validate(invalid)).toBe(false)
  })

  it('rejects unknown extra fields', () => {
    const invalid = {
      type: 'BalanceUnlocked',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 30,
      extra: 'nope',
    }
    expect(validate(invalid)).toBe(false)
  })
})

import { describe, it, expect } from 'bun:test'
import { createAjv } from '../src/validation/ajv'
import { MoneyWithdrawnSchema } from '../src/schemas/v1/MoneyWithdrawn.schema'

describe('MoneyWithdrawn schema v1', () => {
  const ajv = createAjv()
  const validate = ajv.compile(MoneyWithdrawnSchema)

  it('accepts a valid payload', () => {
    const valid = {
      type: 'MoneyWithdrawn',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 50,
      balanceAfter: 50,
    }
    expect(validate(valid)).toBe(true)
  })

  it('rejects when a required field is missing', () => {
    const invalid = {
      type: 'MoneyWithdrawn',
      occurredAt: '2026-05-12T00:00:00.000Z',
      amount: 50,
      balanceAfter: 50,
    }
    expect(validate(invalid)).toBe(false)
  })

  it('rejects unknown extra fields', () => {
    const invalid = {
      type: 'MoneyWithdrawn',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 50,
      balanceAfter: 50,
      extra: 'nope',
    }
    expect(validate(invalid)).toBe(false)
  })
})

import { describe, it, expect } from 'bun:test'
import { createAjv } from '../src/validation/ajv'
import { MoneyDepositedSchema } from '../src/schemas/v1/MoneyDeposited.schema'

describe('MoneyDeposited schema v1', () => {
  const ajv = createAjv()
  const validate = ajv.compile(MoneyDepositedSchema)

  it('accepts a valid payload', () => {
    const valid = {
      type: 'MoneyDeposited',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 100,
      balanceAfter: 100,
    }
    expect(validate(valid)).toBe(true)
  })

  it('rejects when a required field is missing', () => {
    const invalid = {
      type: 'MoneyDeposited',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 100,
    }
    expect(validate(invalid)).toBe(false)
  })

  it('rejects unknown extra fields', () => {
    const invalid = {
      type: 'MoneyDeposited',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 100,
      balanceAfter: 100,
      extra: 'nope',
    }
    expect(validate(invalid)).toBe(false)
  })
})

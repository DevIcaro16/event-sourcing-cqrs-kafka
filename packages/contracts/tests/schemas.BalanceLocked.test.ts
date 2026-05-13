import { describe, it, expect } from 'bun:test'
import { createAjv } from '../src/validation/ajv'
import { BalanceLockedSchema } from '../src/schemas/v1/BalanceLocked.schema'

describe('BalanceLocked schema v1', () => {
  const ajv = createAjv()
  const validate = ajv.compile(BalanceLockedSchema)

  it('accepts a valid payload', () => {
    const valid = {
      type: 'BalanceLocked',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 30,
      reason: 'transfer-pending',
    }
    expect(validate(valid)).toBe(true)
  })

  it('rejects when a required field is missing', () => {
    const invalid = {
      type: 'BalanceLocked',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 30,
    }
    expect(validate(invalid)).toBe(false)
  })

  it('rejects unknown extra fields', () => {
    const invalid = {
      type: 'BalanceLocked',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 30,
      reason: 'transfer-pending',
      extra: 'nope',
    }
    expect(validate(invalid)).toBe(false)
  })
})

import { describe, it, expect } from 'bun:test'
import { createAjv } from '../src/validation/ajv'
import { TransactionReversedSchema } from '../src/schemas/v1/TransactionReversed.schema'

describe('TransactionReversed schema v1', () => {
  const ajv = createAjv()
  const validate = ajv.compile(TransactionReversedSchema)

  it('accepts a valid payload', () => {
    const valid = {
      type: 'TransactionReversed',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      originalEventId: 'orig-1',
      amount: 30,
      balanceAfter: 100,
    }
    expect(validate(valid)).toBe(true)
  })

  it('rejects when a required field is missing', () => {
    const invalid = {
      type: 'TransactionReversed',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      amount: 30,
      balanceAfter: 100,
    }
    expect(validate(invalid)).toBe(false)
  })

  it('rejects unknown extra fields', () => {
    const invalid = {
      type: 'TransactionReversed',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      originalEventId: 'orig-1',
      amount: 30,
      balanceAfter: 100,
      extra: 'nope',
    }
    expect(validate(invalid)).toBe(false)
  })
})

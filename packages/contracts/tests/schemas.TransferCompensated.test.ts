import { describe, it, expect } from 'bun:test'
import { createAjv } from '../src/validation/ajv'
import { TransferCompensatedSchema } from '../src/schemas/v1/TransferCompensated.schema'

describe('TransferCompensated schema v1', () => {
  const ajv = createAjv()
  const validate = ajv.compile(TransferCompensatedSchema)

  it('accepts a valid payload', () => {
    const valid = {
      type: 'TransferCompensated',
      occurredAt: '2026-05-12T00:00:00.000Z',
      sagaId: 's',
      fromAccountId: 'a',
      toAccountId: 'b',
      amount: 25,
      balanceAfter: 100,
    }
    expect(validate(valid)).toBe(true)
  })

  it('rejects when a required field is missing', () => {
    const invalid = {
      type: 'TransferCompensated',
      occurredAt: '2026-05-12T00:00:00.000Z',
      fromAccountId: 'a',
      toAccountId: 'b',
      amount: 25,
      balanceAfter: 100,
    }
    expect(validate(invalid)).toBe(false)
  })

  it('rejects unknown extra fields', () => {
    const invalid = {
      type: 'TransferCompensated',
      occurredAt: '2026-05-12T00:00:00.000Z',
      sagaId: 's',
      fromAccountId: 'a',
      toAccountId: 'b',
      amount: 25,
      balanceAfter: 100,
      extra: 'nope',
    }
    expect(validate(invalid)).toBe(false)
  })
})

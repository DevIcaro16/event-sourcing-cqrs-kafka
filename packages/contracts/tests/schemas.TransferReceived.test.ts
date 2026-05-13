import { describe, it, expect } from 'bun:test'
import { createAjv } from '../src/validation/ajv'
import { TransferReceivedSchema } from '../src/schemas/v1/TransferReceived.schema'

describe('TransferReceived schema v1', () => {
  const ajv = createAjv()
  const validate = ajv.compile(TransferReceivedSchema)

  it('accepts a valid payload', () => {
    const valid = {
      type: 'TransferReceived',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'b',
      fromAccountId: 'a',
      amount: 25,
      balanceAfter: 125,
    }
    expect(validate(valid)).toBe(true)
  })

  it('rejects when a required field is missing', () => {
    const invalid = {
      type: 'TransferReceived',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'b',
      amount: 25,
      balanceAfter: 125,
    }
    expect(validate(invalid)).toBe(false)
  })

  it('rejects unknown extra fields', () => {
    const invalid = {
      type: 'TransferReceived',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'b',
      fromAccountId: 'a',
      amount: 25,
      balanceAfter: 125,
      extra: 'nope',
    }
    expect(validate(invalid)).toBe(false)
  })
})

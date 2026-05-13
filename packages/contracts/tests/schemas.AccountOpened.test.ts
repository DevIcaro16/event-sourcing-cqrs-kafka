import { describe, it, expect } from 'bun:test'
import { createAjv } from '../src/validation/ajv'
import { AccountOpenedSchema } from '../src/schemas/v1/AccountOpened.schema'

describe('AccountOpened schema v1', () => {
  const ajv = createAjv()
  const validate = ajv.compile(AccountOpenedSchema)

  it('accepts a valid payload', () => {
    const valid = {
      type: 'AccountOpened',
      occurredAt: '2026-05-12T00:00:00.000Z',
      eventId: '11111111-1111-1111-1111-111111111111',
      accountId: 'acc-1',
      ownerId: 'owner-1',
      initialBalance: 0,
    }
    expect(validate(valid)).toBe(true)
  })

  it('rejects when required field accountId is missing', () => {
    const invalid = {
      type: 'AccountOpened',
      occurredAt: '2026-05-12T00:00:00.000Z',
      ownerId: 'owner-1',
      initialBalance: 0,
    }
    expect(validate(invalid)).toBe(false)
  })

  it('rejects unknown extra fields', () => {
    const invalid = {
      type: 'AccountOpened',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'acc-1',
      ownerId: 'owner-1',
      initialBalance: 0,
      extra: 'nope',
    }
    expect(validate(invalid)).toBe(false)
  })

  it('rejects negative initialBalance', () => {
    const invalid = {
      type: 'AccountOpened',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'acc-1',
      ownerId: 'owner-1',
      initialBalance: -1,
    }
    expect(validate(invalid)).toBe(false)
  })
})

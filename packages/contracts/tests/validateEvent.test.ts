import { describe, it, expect } from 'bun:test'
import { validateEvent } from '../src/validation/validateEvent'

describe('validateEvent', () => {
  it('returns valid=true for a well-formed v1 AccountOpened', () => {
    const payload = {
      type: 'AccountOpened',
      occurredAt: '2026-05-12T00:00:00.000Z',
      accountId: 'a',
      ownerId: 'o',
      initialBalance: 0,
    }
    expect(validateEvent('AccountOpened', 1, payload).valid).toBe(true)
  })

  it('returns valid=false with errors for a missing required field', () => {
    const payload = {
      type: 'AccountOpened',
      occurredAt: '2026-05-12T00:00:00.000Z',
      ownerId: 'o',
      initialBalance: 0,
    }
    const result = validateEvent('AccountOpened', 1, payload)
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('returns valid=false and a "schema not registered" error for unknown eventType', () => {
    const result = validateEvent('UnknownEvent', 1, {})
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].message).toContain('No schema registered')
  })

  it('returns valid=false for unknown version of a known event', () => {
    const result = validateEvent('AccountOpened', 99, {})
    expect(result.valid).toBe(false)
    expect(result.errors![0].message).toContain('No schema registered')
  })

  it('validates all 9 v1 events at the dispatcher level', () => {
    const samples: Array<[string, object]> = [
      ['AccountOpened', { type: 'AccountOpened', occurredAt: '2026-05-12T00:00:00.000Z', accountId: 'a', ownerId: 'o', initialBalance: 0 }],
      ['MoneyDeposited', { type: 'MoneyDeposited', occurredAt: '2026-05-12T00:00:00.000Z', accountId: 'a', amount: 1, balanceAfter: 1 }],
      ['MoneyWithdrawn', { type: 'MoneyWithdrawn', occurredAt: '2026-05-12T00:00:00.000Z', accountId: 'a', amount: 1, balanceAfter: 0 }],
      ['TransferInitiated', { type: 'TransferInitiated', occurredAt: '2026-05-12T00:00:00.000Z', sagaId: 's', fromAccountId: 'a', toAccountId: 'b', amount: 1, balanceAfter: 0 }],
      ['TransferReceived', { type: 'TransferReceived', occurredAt: '2026-05-12T00:00:00.000Z', accountId: 'b', fromAccountId: 'a', amount: 1, balanceAfter: 1 }],
      ['TransferCompensated', { type: 'TransferCompensated', occurredAt: '2026-05-12T00:00:00.000Z', sagaId: 's', fromAccountId: 'a', toAccountId: 'b', amount: 1, balanceAfter: 1 }],
      ['BalanceLocked', { type: 'BalanceLocked', occurredAt: '2026-05-12T00:00:00.000Z', accountId: 'a', amount: 1, reason: 'r' }],
      ['BalanceUnlocked', { type: 'BalanceUnlocked', occurredAt: '2026-05-12T00:00:00.000Z', accountId: 'a', amount: 1 }],
      ['TransactionReversed', { type: 'TransactionReversed', occurredAt: '2026-05-12T00:00:00.000Z', accountId: 'a', originalEventId: 'orig', amount: 1, balanceAfter: 0 }],
    ]
    for (const [eventType, payload] of samples) {
      const result = validateEvent(eventType, 1, payload)
      expect(result.valid).toBe(true)
    }
  })
})

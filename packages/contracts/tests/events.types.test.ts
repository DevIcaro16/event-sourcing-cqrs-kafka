import { describe, it, expect } from 'bun:test'
import type {
  AccountOpened,
  MoneyDeposited,
  MoneyWithdrawn,
  TransferInitiated,
  TransferReceived,
  TransferCompensated,
  BalanceLocked,
  BalanceUnlocked,
  TransactionReversed,
  AccountEvent,
} from '../src/events/v1'

describe('v1 event types', () => {
  it('AccountOpened holds the canonical shape', () => {
    const e: AccountOpened = {
      type: 'AccountOpened',
      occurredAt: new Date('2026-05-12T00:00:00.000Z'),
      eventId: 'e1',
      accountId: 'acc-1',
      ownerId: 'owner-1',
      initialBalance: 0,
    }
    expect(e.type).toBe('AccountOpened')
  })

  it('MoneyDeposited holds the canonical shape', () => {
    const e: MoneyDeposited = {
      type: 'MoneyDeposited',
      occurredAt: new Date(),
      accountId: 'a',
      amount: 100,
      balanceAfter: 100,
    }
    expect(e.amount).toBe(100)
  })

  it('MoneyWithdrawn holds the canonical shape', () => {
    const e: MoneyWithdrawn = {
      type: 'MoneyWithdrawn',
      occurredAt: new Date(),
      accountId: 'a',
      amount: 50,
      balanceAfter: 50,
    }
    expect(e.balanceAfter).toBe(50)
  })

  it('TransferInitiated includes sagaId', () => {
    const e: TransferInitiated = {
      type: 'TransferInitiated',
      occurredAt: new Date(),
      sagaId: 's',
      fromAccountId: 'a',
      toAccountId: 'b',
      amount: 25,
      balanceAfter: 75,
    }
    expect(e.sagaId).toBe('s')
  })

  it('TransferReceived holds the canonical shape', () => {
    const e: TransferReceived = {
      type: 'TransferReceived',
      occurredAt: new Date(),
      accountId: 'b',
      fromAccountId: 'a',
      amount: 25,
      balanceAfter: 125,
    }
    expect(e.fromAccountId).toBe('a')
  })

  it('TransferCompensated holds the canonical shape', () => {
    const e: TransferCompensated = {
      type: 'TransferCompensated',
      occurredAt: new Date(),
      sagaId: 's',
      fromAccountId: 'a',
      toAccountId: 'b',
      amount: 25,
      balanceAfter: 100,
    }
    expect(e.sagaId).toBe('s')
  })

  it('BalanceLocked holds the canonical shape', () => {
    const e: BalanceLocked = {
      type: 'BalanceLocked',
      occurredAt: new Date(),
      accountId: 'a',
      amount: 30,
      reason: 'transfer-pending',
    }
    expect(e.reason).toBe('transfer-pending')
  })

  it('BalanceUnlocked holds the canonical shape', () => {
    const e: BalanceUnlocked = {
      type: 'BalanceUnlocked',
      occurredAt: new Date(),
      accountId: 'a',
      amount: 30,
    }
    expect(e.amount).toBe(30)
  })

  it('TransactionReversed holds the canonical shape', () => {
    const e: TransactionReversed = {
      type: 'TransactionReversed',
      occurredAt: new Date(),
      accountId: 'a',
      originalEventId: 'orig-1',
      amount: 30,
      balanceAfter: 100,
    }
    expect(e.originalEventId).toBe('orig-1')
  })

  it('AccountEvent union accepts every variant', () => {
    const events: AccountEvent[] = [
      { type: 'AccountOpened', occurredAt: new Date(), accountId: 'a', ownerId: 'o', initialBalance: 0 },
      { type: 'MoneyDeposited', occurredAt: new Date(), accountId: 'a', amount: 1, balanceAfter: 1 },
      { type: 'MoneyWithdrawn', occurredAt: new Date(), accountId: 'a', amount: 1, balanceAfter: 0 },
      { type: 'TransferInitiated', occurredAt: new Date(), sagaId: 's', fromAccountId: 'a', toAccountId: 'b', amount: 1, balanceAfter: 0 },
      { type: 'TransferReceived', occurredAt: new Date(), accountId: 'b', fromAccountId: 'a', amount: 1, balanceAfter: 1 },
      { type: 'TransferCompensated', occurredAt: new Date(), sagaId: 's', fromAccountId: 'a', toAccountId: 'b', amount: 1, balanceAfter: 1 },
      { type: 'BalanceLocked', occurredAt: new Date(), accountId: 'a', amount: 1, reason: 'r' },
      { type: 'BalanceUnlocked', occurredAt: new Date(), accountId: 'a', amount: 1 },
      { type: 'TransactionReversed', occurredAt: new Date(), accountId: 'a', originalEventId: 'orig', amount: 1, balanceAfter: 0 },
    ]
    expect(events).toHaveLength(9)
  })
})

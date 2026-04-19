import { describe, it, expect } from 'bun:test'
import { InvalidAmountError, InsufficientFundsError } from '../../../src/domain/account/AccountErrors'
import { Account } from '../../../src/domain/account/Account'

describe('Account.open', () => {
  it('emits AccountOpened event with correct data', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    const events = account.pendingEvents
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('AccountOpened')
    expect((events[0] as any).accountId).toBe('acc-1')
    expect((events[0] as any).initialBalance).toBe(500)
  })

  it('sets balance to initialBalance', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    expect(account.balance).toBe(500)
  })

  it('sets availableBalance equal to balance when nothing is locked', () => {
    const account = Account.open('acc-1', 'owner-1', 300)
    expect(account.availableBalance).toBe(300)
  })

  it('starts at baseVersion 0 after open (no history loaded)', () => {
    const account = Account.open('acc-1', 'owner-1', 0)
    expect(account.baseVersion).toBe(0)
    expect(account.version).toBe(1)
  })

  it('rejects negative initialBalance', () => {
    expect(() => Account.open('acc-1', 'owner-1', -1)).toThrow(InvalidAmountError)
  })

  it('allows zero initialBalance', () => {
    const account = Account.open('acc-1', 'owner-1', 0)
    expect(account.balance).toBe(0)
  })
})

describe('Account.deposit', () => {
  it('emits MoneyDeposited event', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    account.clearPendingEvents()
    account.deposit(50)
    expect(account.pendingEvents).toHaveLength(1)
    expect(account.pendingEvents[0].type).toBe('MoneyDeposited')
  })

  it('increases balance', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    account.deposit(50)
    expect(account.balance).toBe(150)
  })

  it('event carries correct balanceAfter', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    account.clearPendingEvents()
    account.deposit(50)
    expect((account.pendingEvents[0] as any).balanceAfter).toBe(150)
  })

  it('rejects zero amount', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.deposit(0)).toThrow(InvalidAmountError)
  })

  it('rejects negative amount', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.deposit(-10)).toThrow(InvalidAmountError)
  })
})

describe('Account.withdraw', () => {
  it('emits MoneyWithdrawn event', () => {
    const account = Account.open('acc-1', 'owner-1', 200)
    account.clearPendingEvents()
    account.withdraw(80)
    expect(account.pendingEvents[0].type).toBe('MoneyWithdrawn')
  })

  it('decreases balance', () => {
    const account = Account.open('acc-1', 'owner-1', 200)
    account.withdraw(80)
    expect(account.balance).toBe(120)
  })

  it('event carries correct balanceAfter', () => {
    const account = Account.open('acc-1', 'owner-1', 200)
    account.clearPendingEvents()
    account.withdraw(80)
    expect((account.pendingEvents[0] as any).balanceAfter).toBe(120)
  })

  it('rejects withdrawal exceeding available balance', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.withdraw(101)).toThrow(InsufficientFundsError)
  })

  it('rejects zero amount', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.withdraw(0)).toThrow(InvalidAmountError)
  })
})

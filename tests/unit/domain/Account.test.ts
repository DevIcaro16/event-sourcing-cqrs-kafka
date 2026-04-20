import { describe, it, expect } from 'bun:test'
import { InvalidAmountError, InsufficientFundsError, InvalidReversalError } from '../../../src/domain/account/AccountErrors'
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

describe('Account.initiateTransfer', () => {
  it('emits TransferInitiated event', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.clearPendingEvents()
    account.initiateTransfer('acc-2', 200)
    expect(account.pendingEvents[0].type).toBe('TransferInitiated')
  })

  it('decreases balance on origin', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.initiateTransfer('acc-2', 200)
    expect(account.balance).toBe(300)
  })

  it('rejects transfer exceeding available balance', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.initiateTransfer('acc-2', 101)).toThrow(InsufficientFundsError)
  })

  it('rejects zero amount', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.initiateTransfer('acc-2', 0)).toThrow(InvalidAmountError)
  })
})

describe('Account.receiveTransfer', () => {
  it('emits TransferReceived event', () => {
    const account = Account.open('acc-2', 'owner-2', 0)
    account.clearPendingEvents()
    account.receiveTransfer('acc-1', 200)
    expect(account.pendingEvents[0].type).toBe('TransferReceived')
  })

  it('increases balance on destination', () => {
    const account = Account.open('acc-2', 'owner-2', 50)
    account.receiveTransfer('acc-1', 200)
    expect(account.balance).toBe(250)
  })
})

describe('Account.lockBalance', () => {
  it('emits BalanceLocked event', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.clearPendingEvents()
    account.lockBalance(100, 'guarantee')
    expect(account.pendingEvents[0].type).toBe('BalanceLocked')
  })

  it('reduces availableBalance without changing balance', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.lockBalance(100, 'guarantee')
    expect(account.balance).toBe(500)
    expect(account.availableBalance).toBe(400)
    expect(account.lockedBalance).toBe(100)
  })

  it('rejects lock exceeding available balance', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.lockBalance(101, 'reason')).toThrow(InsufficientFundsError)
  })
})

describe('Account.unlockBalance', () => {
  it('emits BalanceUnlocked event', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.lockBalance(100, 'guarantee')
    account.clearPendingEvents()
    account.unlockBalance(100)
    expect(account.pendingEvents[0].type).toBe('BalanceUnlocked')
  })

  it('restores availableBalance', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.lockBalance(100, 'guarantee')
    account.unlockBalance(100)
    expect(account.availableBalance).toBe(500)
    expect(account.lockedBalance).toBe(0)
  })

  it('rejects unlock exceeding lockedBalance', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.lockBalance(50, 'guarantee')
    expect(() => account.unlockBalance(100)).toThrow(InvalidReversalError)
  })
})

describe('Account.reverseTransaction', () => {
  it('emits TransactionReversed event', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.withdraw(100)
    account.clearPendingEvents()
    account.reverseTransaction('original-event-id', 100, 'MoneyWithdrawn')
    expect(account.pendingEvents[0].type).toBe('TransactionReversed')
  })

  it('credits balance when reversing a withdrawal', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.withdraw(100)
    account.reverseTransaction('original-event-id', 100, 'MoneyWithdrawn')
    expect(account.balance).toBe(500)
  })

  it('debits balance when reversing a deposit', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.deposit(200)
    account.reverseTransaction('original-event-id', 200, 'MoneyDeposited')
    expect(account.balance).toBe(500)
  })

  it('rejects reversal of zero amount', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    expect(() => account.reverseTransaction('id', 0, 'MoneyWithdrawn')).toThrow(InvalidAmountError)
  })
})

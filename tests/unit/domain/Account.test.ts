import { describe, it, expect } from 'bun:test'
import { Account } from '../../../src/domain/account/Account'
import { InvalidAmountError } from '../../../src/domain/account/AccountErrors'

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

import { describe, it, expect } from 'bun:test'
import { Account } from '../../../src/domain/account/Account'
import type { AccountSnapshot } from '../../../src/domain/account/Account'
import type { DomainEvent } from '../../../src/domain/shared/DomainEvent'

describe('Account.toSnapshot()', () => {
  it('captura o estado atual da conta', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.deposit(200)
    const snapshot = account.toSnapshot()
    expect(snapshot.id).toBe('acc-1')
    expect(snapshot.ownerId).toBe('owner-1')
    expect(snapshot.balance).toBe(700)
    expect(snapshot.lockedBalance).toBe(0)
    expect(snapshot.version).toBe(2)
  })

  it('captura lockedBalance quando há bloqueio', () => {
    const account = Account.open('acc-2', 'owner-2', 1000)
    account.lockBalance(300, 'reserva')
    const snapshot = account.toSnapshot()
    expect(snapshot.balance).toBe(1000)
    expect(snapshot.lockedBalance).toBe(300)
    expect(snapshot.version).toBe(2)
  })
})

describe('Account.fromSnapshot()', () => {
  it('restaura o estado a partir de um snapshot', () => {
    const snapshot: AccountSnapshot = {
      id: 'acc-3',
      ownerId: 'owner-3',
      balance: 800,
      lockedBalance: 100,
      version: 10,
    }
    const account = Account.fromSnapshot(snapshot)
    expect(account.id).toBe('acc-3')
    expect(account.ownerId).toBe('owner-3')
    expect(account.balance).toBe(800)
    expect(account.lockedBalance).toBe(100)
    expect(account.availableBalance).toBe(700)
    expect(account.version).toBe(10)
    expect(account.baseVersion).toBe(10)
  })

  it('permite carregar eventos recentes após restaurar snapshot', () => {
    const original = Account.open('acc-4', 'owner-4', 500)
    original.deposit(200)
    const snapshot = original.toSnapshot()

    const restored = Account.fromSnapshot(snapshot)
    restored.loadFromHistory([
      { type: 'MoneyDeposited', accountId: 'acc-4', amount: 100, balanceAfter: 800, occurredAt: new Date() } as DomainEvent,
    ])
    expect(restored.balance).toBe(800)
    expect(restored.version).toBe(3)
    expect(restored.baseVersion).toBe(3)
  })

  it('snapshot restaurado pode executar comandos e gerar eventos pendentes', () => {
    const snapshot: AccountSnapshot = { id: 'acc-5', ownerId: 'o', balance: 500, lockedBalance: 0, version: 5 }
    const account = Account.fromSnapshot(snapshot)
    account.deposit(50)
    expect(account.pendingEvents).toHaveLength(1)
    expect(account.pendingEvents[0].type).toBe('MoneyDeposited')
    expect(account.baseVersion).toBe(5)
  })
})

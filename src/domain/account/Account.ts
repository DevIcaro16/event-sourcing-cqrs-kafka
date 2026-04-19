// src/domain/account/Account.ts
import { AggregateRoot } from '../shared/AggregateRoot'
import type { AccountEvent } from './AccountEvents'
import { InvalidAmountError, InsufficientFundsError } from './AccountErrors'
import type { DomainEvent } from '../shared/DomainEvent'

export class Account extends AggregateRoot {
  private _id: string = ''
  private _ownerId: string = ''
  private _balance: number = 0
  private _lockedBalance: number = 0

  get id(): string { return this._id }
  get ownerId(): string { return this._ownerId }
  get balance(): number { return this._balance }
  get lockedBalance(): number { return this._lockedBalance }
  get availableBalance(): number { return this._balance - this._lockedBalance }

  static open(accountId: string, ownerId: string, initialBalance: number): Account {
    if (initialBalance < 0) throw new InvalidAmountError(initialBalance)
    const account = new Account()
    account.applyEvent({
      type: 'AccountOpened',
      accountId,
      ownerId,
      initialBalance,
      occurredAt: new Date(),
    })
    return account
  }

  deposit(amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    this.applyEvent({
      type: 'MoneyDeposited',
      accountId: this._id,
      amount,
      balanceAfter: this._balance + amount,
      occurredAt: new Date(),
    })
  }

  withdraw(amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    if (amount > this.availableBalance) throw new InsufficientFundsError(this.availableBalance, amount)
    this.applyEvent({
      type: 'MoneyWithdrawn',
      accountId: this._id,
      amount,
      balanceAfter: this._balance - amount,
      occurredAt: new Date(),
    })
  }

  protected apply(event: DomainEvent): void {
    const e = event as AccountEvent
    switch (e.type) {
      case 'AccountOpened':
        this._id = e.accountId
        this._ownerId = e.ownerId
        this._balance = e.initialBalance
        break
      case 'MoneyDeposited':
        this._balance = e.balanceAfter
        break
      case 'MoneyWithdrawn':
        this._balance = e.balanceAfter
        break
      default:
        break
    }
  }
}

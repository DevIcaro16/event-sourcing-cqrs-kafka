// src/domain/account/AccountEvents.ts
import type { DomainEvent } from '../shared/DomainEvent'

export type AccountOpened = DomainEvent & {
  type: 'AccountOpened'
  accountId: string
  ownerId: string
  initialBalance: number
}

export type MoneyDeposited = DomainEvent & {
  type: 'MoneyDeposited'
  accountId: string
  amount: number
  balanceAfter: number
}

export type MoneyWithdrawn = DomainEvent & {
  type: 'MoneyWithdrawn'
  accountId: string
  amount: number
  balanceAfter: number
}

export type TransferInitiated = DomainEvent & {
  type: 'TransferInitiated'
  fromAccountId: string
  toAccountId: string
  amount: number
  balanceAfter: number
}

export type TransferReceived = DomainEvent & {
  type: 'TransferReceived'
  accountId: string
  fromAccountId: string
  amount: number
  balanceAfter: number
}

export type BalanceLocked = DomainEvent & {
  type: 'BalanceLocked'
  accountId: string
  amount: number
  reason: string
}

export type BalanceUnlocked = DomainEvent & {
  type: 'BalanceUnlocked'
  accountId: string
  amount: number
}

export type TransactionReversed = DomainEvent & {
  type: 'TransactionReversed'
  accountId: string
  originalEventId: string
  amount: number
  balanceAfter: number
}

export type AccountEvent =
  | AccountOpened
  | MoneyDeposited
  | MoneyWithdrawn
  | TransferInitiated
  | TransferReceived
  | BalanceLocked
  | BalanceUnlocked
  | TransactionReversed

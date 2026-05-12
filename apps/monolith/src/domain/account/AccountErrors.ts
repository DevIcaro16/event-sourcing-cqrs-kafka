// src/domain/account/AccountErrors.ts
export class InvalidAmountError extends Error {
  constructor(amount: number) {
    super(`Invalid amount: ${amount}. Must be greater than zero.`)
    this.name = 'InvalidAmountError'
  }
}

export class ConcurrencyError extends Error {
  constructor(aggregateId: string, expectedVersion: number) {
    super(`Concurrency conflict for aggregate '${aggregateId}' at version ${expectedVersion}. Another process modified it first.`)
    this.name = 'ConcurrencyError'
  }
}

export class InsufficientFundsError extends Error {
  constructor(available: number, requested: number) {
    super(`Insufficient funds: available ${available}, requested ${requested}`)
    this.name = 'InsufficientFundsError'
  }
}

export class AccountNotInitializedError extends Error {
  constructor() {
    super('Account has not been initialized. Call Account.open() first.')
    this.name = 'AccountNotInitializedError'
  }
}

export class InvalidReversalError extends Error {
  constructor(reason: string) {
    super(`Cannot reverse transaction: ${reason}`)
    this.name = 'InvalidReversalError'
  }
}

export class AccountNotFoundError extends Error {
  readonly accountId: string
  constructor(accountId: string) {
    super(`Account not found: ${accountId}`)
    this.name = 'AccountNotFoundError'
    this.accountId = accountId
  }
}

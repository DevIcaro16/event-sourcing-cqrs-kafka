// src/domain/account/AccountErrors.ts
export class InvalidAmountError extends Error {
  constructor(amount: number) {
    super(`Invalid amount: ${amount}. Must be greater than zero.`)
    this.name = 'InvalidAmountError'
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

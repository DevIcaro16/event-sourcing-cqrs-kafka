export type { EventEnvelope, EventMetadata } from './envelope'

export type {
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
} from './events/v1'

export {
  AccountOpenedSchema,
  MoneyDepositedSchema,
  MoneyWithdrawnSchema,
  TransferInitiatedSchema,
  TransferReceivedSchema,
  TransferCompensatedSchema,
  BalanceLockedSchema,
  BalanceUnlockedSchema,
  TransactionReversedSchema,
} from './schemas/v1'

export { createAjv, validateEvent } from './validation'
export type { ValidationResult } from './validation'

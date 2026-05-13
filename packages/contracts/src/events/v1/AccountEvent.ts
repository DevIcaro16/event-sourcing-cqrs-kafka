import type { AccountOpened } from './AccountOpened'
import type { MoneyDeposited } from './MoneyDeposited'
import type { MoneyWithdrawn } from './MoneyWithdrawn'
import type { TransferInitiated } from './TransferInitiated'
import type { TransferReceived } from './TransferReceived'
import type { TransferCompensated } from './TransferCompensated'
import type { BalanceLocked } from './BalanceLocked'
import type { BalanceUnlocked } from './BalanceUnlocked'
import type { TransactionReversed } from './TransactionReversed'

export type AccountEvent =
  | AccountOpened
  | MoneyDeposited
  | MoneyWithdrawn
  | TransferInitiated
  | TransferReceived
  | TransferCompensated
  | BalanceLocked
  | BalanceUnlocked
  | TransactionReversed

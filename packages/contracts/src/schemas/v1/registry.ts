import { AccountOpenedSchema } from './AccountOpened.schema'
import { MoneyDepositedSchema } from './MoneyDeposited.schema'
import { MoneyWithdrawnSchema } from './MoneyWithdrawn.schema'
import { TransferInitiatedSchema } from './TransferInitiated.schema'
import { TransferReceivedSchema } from './TransferReceived.schema'
import { TransferCompensatedSchema } from './TransferCompensated.schema'
import { BalanceLockedSchema } from './BalanceLocked.schema'
import { BalanceUnlockedSchema } from './BalanceUnlocked.schema'
import { TransactionReversedSchema } from './TransactionReversed.schema'

export const schemaRegistry: Record<string, Record<number, object>> = {
  AccountOpened: { 1: AccountOpenedSchema },
  MoneyDeposited: { 1: MoneyDepositedSchema },
  MoneyWithdrawn: { 1: MoneyWithdrawnSchema },
  TransferInitiated: { 1: TransferInitiatedSchema },
  TransferReceived: { 1: TransferReceivedSchema },
  TransferCompensated: { 1: TransferCompensatedSchema },
  BalanceLocked: { 1: BalanceLockedSchema },
  BalanceUnlocked: { 1: BalanceUnlockedSchema },
  TransactionReversed: { 1: TransactionReversedSchema },
}

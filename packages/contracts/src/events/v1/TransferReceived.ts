type BaseDomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type TransferReceived = BaseDomainEvent & {
  type: 'TransferReceived'
  accountId: string
  fromAccountId: string
  amount: number
  balanceAfter: number
}

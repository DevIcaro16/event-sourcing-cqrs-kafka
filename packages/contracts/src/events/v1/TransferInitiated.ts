type BaseDomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type TransferInitiated = BaseDomainEvent & {
  type: 'TransferInitiated'
  sagaId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  balanceAfter: number
}

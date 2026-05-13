type BaseDomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type TransferCompensated = BaseDomainEvent & {
  type: 'TransferCompensated'
  sagaId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  balanceAfter: number
}

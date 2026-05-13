type BaseDomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type TransactionReversed = BaseDomainEvent & {
  type: 'TransactionReversed'
  accountId: string
  originalEventId: string
  amount: number
  balanceAfter: number
}

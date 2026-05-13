type BaseDomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type MoneyWithdrawn = BaseDomainEvent & {
  type: 'MoneyWithdrawn'
  accountId: string
  amount: number
  balanceAfter: number
}

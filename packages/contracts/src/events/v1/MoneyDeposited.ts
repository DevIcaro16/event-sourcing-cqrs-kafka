type BaseDomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type MoneyDeposited = BaseDomainEvent & {
  type: 'MoneyDeposited'
  accountId: string
  amount: number
  balanceAfter: number
}

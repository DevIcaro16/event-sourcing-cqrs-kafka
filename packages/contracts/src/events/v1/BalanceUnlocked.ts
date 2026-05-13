type BaseDomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type BalanceUnlocked = BaseDomainEvent & {
  type: 'BalanceUnlocked'
  accountId: string
  amount: number
}

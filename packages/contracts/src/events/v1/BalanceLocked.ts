type BaseDomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type BalanceLocked = BaseDomainEvent & {
  type: 'BalanceLocked'
  accountId: string
  amount: number
  reason: string
}

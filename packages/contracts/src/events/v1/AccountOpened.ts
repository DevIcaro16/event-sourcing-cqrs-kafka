type BaseDomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type AccountOpened = BaseDomainEvent & {
  type: 'AccountOpened'
  accountId: string
  ownerId: string
  initialBalance: number
}

// src/domain/shared/DomainEvent.ts
export type DomainEvent = {
  type: string
  occurredAt: Date
  eventId?: string
}

export type EventMetadata = {
  eventId: string
  eventType: string
  eventVersion: number
  aggregateId: string
  aggregateType: string
  sequence: number
  occurredAt: string
  correlationId: string
  causationId: string | null
}

export type EventEnvelope<T = unknown> = EventMetadata & {
  payload: T
}

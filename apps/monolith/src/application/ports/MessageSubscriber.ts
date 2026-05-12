import type { DomainEvent } from '../../domain/shared/DomainEvent'

export interface MessageSubscriber {
  subscribe(handler: (events: DomainEvent[], aggregateId: string) => Promise<void>): Promise<void>
  close(): Promise<void>
}

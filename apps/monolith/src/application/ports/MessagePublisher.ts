import type { DomainEvent } from '../../domain/shared/DomainEvent'

export interface MessagePublisher {
  publish(events: DomainEvent[], aggregateId: string): Promise<void>
}

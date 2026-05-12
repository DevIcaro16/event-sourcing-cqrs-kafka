import type { DomainEvent } from '../../domain/shared/DomainEvent'

export interface ProjectorPort {
  project(events: DomainEvent[], aggregateId: string): Promise<void>
}

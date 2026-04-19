import type { DomainEvent } from '../../domain/shared/DomainEvent'

export class ConcurrencyError extends Error {
  constructor(aggregateId: string, expectedVersion: number) {
    super(`Concurrency conflict for aggregate '${aggregateId}' at version ${expectedVersion}. Another process modified it first.`)
    this.name = 'ConcurrencyError'
  }
}

export interface EventStore {
  append(
    aggregateId: string,
    aggregateType: string,
    events: DomainEvent[],
    expectedVersion: number
  ): Promise<void>

  load(aggregateId: string): Promise<DomainEvent[]>
}

import type { DomainEvent } from '../../domain/shared/DomainEvent'
import type { CanonicalBalance } from './CanonicalBalanceCache'

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

  loadFrom(aggregateId: string, fromSequence: number): Promise<DomainEvent[]>

  /** Returns the event that belongs to aggregateId with the given id, or null if not found. */
  findEventById(eventId: string, aggregateId: string): Promise<DomainEvent | null>

  /** Returns the highest sequence_number stored for the aggregate, or 0 if no events exist. */
  getLatestSequence(aggregateId: string): Promise<number>

  /**
   * Computes the canonical balance directly from event payloads via SQL aggregation.
   * Returns null if the aggregate has no events.
   */
  computeCanonicalBalance(aggregateId: string): Promise<CanonicalBalance | null>
}

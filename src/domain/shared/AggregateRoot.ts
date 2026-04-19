import type { DomainEvent } from './DomainEvent'

export abstract class AggregateRoot {
  private _pendingEvents: DomainEvent[] = []
  private _version: number = 0
  private _baseVersion: number = 0

  get version(): number { return this._version }
  get baseVersion(): number { return this._baseVersion }
  get pendingEvents(): DomainEvent[] { return [...this._pendingEvents] }

  protected applyEvent<T extends DomainEvent>(event: T): void {
    this.apply(event)
    this._pendingEvents.push(event)
    this._version++
  }

  loadFromHistory(events: DomainEvent[]): void {
    for (const event of events) {
      this.apply(event)
      this._version++
    }
    this._baseVersion = this._version
  }

  clearPendingEvents(): void {
    this._pendingEvents = []
    this._baseVersion = this._version
  }

  protected abstract apply(event: DomainEvent): void
}

import type postgres from 'postgres'
import type { DomainEvent } from '../../domain/shared/DomainEvent'

export type OutboxEntry = {
  id: string
  aggregateId: string
  events: DomainEvent[]
}

export class PostgresOutboxStore {
  constructor(private readonly sql: postgres.Sql) {}

  async getPending(limit = 100): Promise<OutboxEntry[]> {
    const rows = await this.sql<{ id: string; aggregate_id: string; events: unknown }[]>`
      SELECT id, aggregate_id, events
      FROM outbox
      WHERE published_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${limit}
    `
    return rows.map(row => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      events: (typeof row.events === 'string'
        ? JSON.parse(row.events)
        : row.events) as DomainEvent[],
    }))
  }

  async markPublished(id: string): Promise<void> {
    await this.sql`
      UPDATE outbox
      SET published_at = NOW()
      WHERE id = ${id}::uuid
    `
  }
}

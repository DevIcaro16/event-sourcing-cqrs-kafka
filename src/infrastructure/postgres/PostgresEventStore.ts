// src/infrastructure/postgres/PostgresEventStore.ts
import type postgres from 'postgres'
import type { EventStore } from '../../application/ports/EventStore'
import type { DomainEvent } from '../../domain/shared/DomainEvent'
import type { CanonicalBalance } from '../../application/ports/CanonicalBalanceCache'
import { ConcurrencyError } from '@domain/account/AccountErrors'

export class PostgresEventStore implements EventStore {
  constructor(private readonly sql: postgres.Sql) { }

  async append(
    aggregateId: string,
    aggregateType: string,
    events: DomainEvent[],
    expectedVersion: number
  ): Promise<void> {
    if (events.length === 0) return
    try {
      await this.sql.begin(async (tx) => {
        for (let i = 0; i < events.length; i++) {
          const event = events[i]
          const sequenceNumber = expectedVersion + i + 1
          await tx`
            INSERT INTO events
              (aggregate_id, aggregate_type, event_type, payload, sequence_number, occurred_at)
            VALUES (
              ${aggregateId}::uuid,
              ${aggregateType},
              ${event.type},
              ${JSON.stringify(event)}::jsonb,
              ${sequenceNumber},
              ${event.occurredAt}
            )
          `
        }
        await tx`
          INSERT INTO outbox (aggregate_id, events)
          VALUES (${aggregateId}::uuid, ${JSON.stringify(events)}::jsonb)
        `
      })
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConcurrencyError(aggregateId, expectedVersion)
      }
      throw err
    }
  }

  async load(aggregateId: string): Promise<DomainEvent[]> {
    const rows = await this.sql<{ payload: DomainEvent | string }[]>`
      SELECT payload
      FROM events
      WHERE aggregate_id = ${aggregateId}::uuid
      ORDER BY sequence_number ASC
    `
    return rows.map((row) =>
      typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
    )
  }

  async loadFrom(aggregateId: string, fromSequence: number): Promise<DomainEvent[]> {
    const rows = await this.sql<{ payload: DomainEvent | string }[]>`
      SELECT payload
      FROM events
      WHERE aggregate_id = ${aggregateId}::uuid
        AND sequence_number >= ${fromSequence}
      ORDER BY sequence_number ASC
    `
    return rows.map((row) =>
      typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
    )
  }

  async findEventById(eventId: string, aggregateId: string): Promise<DomainEvent | null> {
    const rows = await this.sql<{ payload: DomainEvent | string }[]>`
      SELECT payload
      FROM events
      WHERE id = ${eventId}::uuid
        AND aggregate_id = ${aggregateId}::uuid
    `
    if (rows.length === 0) return null
    const row = rows[0]
    return typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  }

  async getLatestSequence(aggregateId: string): Promise<number> {
    const rows = await this.sql<{ max: string | null }[]>`
      SELECT MAX(sequence_number) AS max
      FROM events
      WHERE aggregate_id = ${aggregateId}::uuid
    `
    return rows[0].max != null ? Number(rows[0].max) : 0
  }

  async computeCanonicalBalance(aggregateId: string): Promise<CanonicalBalance | null> {
    const rows = await this.sql<{ balance: string | null; locked_balance: string }[]>`
      SELECT
        (
          SELECT COALESCE(payload->>'balanceAfter', payload->>'initialBalance')::numeric
          FROM events
          WHERE aggregate_id = ${aggregateId}::uuid
            AND payload->>'type' IN (
              'AccountOpened', 'MoneyDeposited', 'MoneyWithdrawn',
              'TransferInitiated', 'TransferReceived', 'TransactionReversed'
            )
          ORDER BY sequence_number DESC
          LIMIT 1
        ) AS balance,
        COALESCE((
          SELECT SUM(
            CASE payload->>'type'
              WHEN 'BalanceLocked'   THEN  (payload->>'amount')::numeric
              WHEN 'BalanceUnlocked' THEN -(payload->>'amount')::numeric
            END
          )
          FROM events
          WHERE aggregate_id = ${aggregateId}::uuid
            AND payload->>'type' IN ('BalanceLocked', 'BalanceUnlocked')
        ), 0) AS locked_balance
    `
    if (rows[0].balance == null) return null
    return {
      balance: Number(rows[0].balance),
      lockedBalance: Number(rows[0].locked_balance),
    }
  }
}

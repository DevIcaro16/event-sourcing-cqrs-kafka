import type postgres from 'postgres'
import type { IdempotencyStore } from '../../application/ports/IdempotencyStore'

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly sql: postgres.Sql) {}

  async tryAcquire(key: string, route: string): Promise<boolean> {
    await this.sql`DELETE FROM idempotency_keys WHERE expires_at < NOW()`
    const result = await this.sql`
      INSERT INTO idempotency_keys (key, route)
      VALUES (${key}, ${route})
      ON CONFLICT DO NOTHING
      RETURNING key
    `
    return result.length === 1
  }

  async getResponse(key: string, route: string): Promise<Record<string, unknown> | null> {
    const rows = await this.sql<{ response: unknown }[]>`
      SELECT response
      FROM idempotency_keys
      WHERE key = ${key} AND route = ${route} AND expires_at > NOW()
    `
    if (rows.length === 0 || rows[0].response == null) return null
    const raw = rows[0].response
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
  }

  async saveResponse(key: string, route: string, response: Record<string, unknown>): Promise<void> {
    await this.sql`
      UPDATE idempotency_keys
      SET response = ${JSON.stringify(response)}::jsonb
      WHERE key = ${key} AND route = ${route}
    `
  }
}

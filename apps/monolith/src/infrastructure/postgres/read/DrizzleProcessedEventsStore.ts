import { drizzle } from 'drizzle-orm/postgres-js'
import type postgres from 'postgres'
import type { ProcessedEventsStore } from '../../../application/ports/ProcessedEventsStore'
import { processedEvents } from './schema'

export class DrizzleProcessedEventsStore implements ProcessedEventsStore {
  private readonly db: ReturnType<typeof drizzle>

  constructor(sql: postgres.Sql) {
    this.db = drizzle(sql)
  }

  async tryMarkProcessed(eventId: string): Promise<boolean> {
    const result = await this.db
      .insert(processedEvents)
      .values({ eventId })
      .onConflictDoNothing()
      .returning({ eventId: processedEvents.eventId })
    return result.length > 0
  }
}

import type { PostgresOutboxStore } from '../postgres/PostgresOutboxStore'
import type { MessagePublisher } from '../../application/ports/MessagePublisher'

export class OutboxRelay {
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly outboxStore: PostgresOutboxStore,
    private readonly publisher: MessagePublisher,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    this.running = true
    this.schedule()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private schedule(): void {
    if (!this.running) return
    this.timer = setTimeout(async () => {
      await this.processOnce()
      this.schedule()
    }, this.intervalMs)
  }

  async processOnce(): Promise<void> {
    const pending = await this.outboxStore.getPending(100)
    for (const entry of pending) {
      try {
        await this.publisher.publish(entry.events, entry.aggregateId)
        await this.outboxStore.markPublished(entry.id)
      } catch (err) {
        console.error('OutboxRelay: falha ao publicar entrada', { id: entry.id, err })
      }
    }
  }
}

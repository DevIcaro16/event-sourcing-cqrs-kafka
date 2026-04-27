import type { Kafka } from 'kafkajs'
import type { DomainEvent } from '../../domain/shared/DomainEvent'
import { dlqTotal } from '../telemetry/metrics'

type DLQMessage = {
  aggregateId: string
  events: Array<Record<string, unknown> & { occurredAt: string }>
  publishedAt: string
}

export class DLQConsumer {
  private readonly consumer

  constructor(private readonly kafka: Kafka) {
    this.consumer = kafka.consumer({ groupId: 'banking-dlq-monitor' })
  }

  async start(topic: string): Promise<void> {
    await this.consumer.connect()
    await this.consumer.subscribe({ topic, fromBeginning: false })

    await this.consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }) => {
        if (!message.value) return

        const { aggregateId, events }: DLQMessage = JSON.parse(message.value.toString())
        const types = events.map(e => e.type).join(', ')

        console.error('[dlq] message received', {
          aggregateId,
          eventTypes: types,
          eventCount: events.length,
          publishedAt: events[0] ? (events[0] as DomainEvent & { occurredAt: string }).occurredAt : null,
        })

        dlqTotal.add(events.length, { topic })
      },
    })

    console.log(`[dlq] consumer started → topic="${topic}"`)
  }

  async close(): Promise<void> {
    await this.consumer.disconnect()
    console.log('[dlq] consumer disconnected')
  }
}

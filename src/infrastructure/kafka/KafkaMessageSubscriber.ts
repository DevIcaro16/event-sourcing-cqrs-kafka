import type { Kafka, Consumer } from 'kafkajs'
import type { MessageSubscriber } from '../../application/ports/MessageSubscriber'
import type { DomainEvent } from '../../domain/shared/DomainEvent'

type BrokerMessage = {
  aggregateId: string
  events: Array<Record<string, unknown> & { occurredAt: string }>
  publishedAt: string
}

export class KafkaMessageSubscriber implements MessageSubscriber {
  constructor(
    private readonly consumer: Consumer,
    private readonly topic: string,
  ) {}

  static create(kafka: Kafka, topic: string, groupId: string): KafkaMessageSubscriber {
    return new KafkaMessageSubscriber(kafka.consumer({ groupId }), topic)
  }

  async subscribe(
    handler: (events: DomainEvent[], aggregateId: string) => Promise<void>,
  ): Promise<void> {
    await this.consumer.connect()
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false })
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return
        const { aggregateId, events }: BrokerMessage = JSON.parse(message.value.toString())
        const parsed = events.map(e => ({ ...e, occurredAt: new Date(e.occurredAt) })) as DomainEvent[]
        await handler(parsed, aggregateId)
      },
    })
  }

  async close(): Promise<void> {
    await this.consumer.disconnect()
  }
}

import type { Kafka, Producer } from 'kafkajs'
import type { MessagePublisher } from '../../application/ports/MessagePublisher'
import type { DomainEvent } from '../../domain/shared/DomainEvent'

export class KafkaMessagePublisher implements MessagePublisher {
  constructor(
    private readonly producer: Producer,
    private readonly topic: string,
  ) {}

  static create(kafka: Kafka, topic: string): KafkaMessagePublisher {
    return new KafkaMessagePublisher(kafka.producer(), topic)
  }

  async connect(): Promise<void> {
    await this.producer.connect()
  }

  async close(): Promise<void> {
    await this.producer.disconnect()
  }

  async publish(events: DomainEvent[], aggregateId: string): Promise<void> {
    const value = JSON.stringify({
      aggregateId,
      events: events.map(e => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
      publishedAt: new Date().toISOString(),
    })
    await this.producer.send({
      topic: this.topic,
      messages: [{ key: aggregateId, value }],
    })
  }
}

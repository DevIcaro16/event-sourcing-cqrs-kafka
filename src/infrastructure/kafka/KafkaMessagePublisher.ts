import type { Kafka, Producer } from 'kafkajs'
import type { MessagePublisher } from '../../application/ports/MessagePublisher'
import type { DomainEvent } from '../../domain/shared/DomainEvent'
import { kafkaPublishedTotal } from '../telemetry/metrics'

export class KafkaMessagePublisher implements MessagePublisher {
  constructor(
    private readonly producer: Producer,
    private readonly topic: string,
  ) { }

  static create(kafka: Kafka, topic: string): KafkaMessagePublisher {
    return new KafkaMessagePublisher(kafka.producer(), topic)
  }

  async connect(): Promise<void> {
    await this.producer.connect()
    console.log(`[kafka:publisher] connected → topic="${this.topic}"`)
  }

  async close(): Promise<void> {
    await this.producer.disconnect()
    console.log(`[kafka:publisher] disconnected → topic="${this.topic}"`)
  }

  async publish(events: DomainEvent[], aggregateId: string): Promise<void> {
    const types = events.map(e => e.type).join(', ')
    console.log(`[kafka:publisher] publishing ${events.length} event(s) [${types}] → aggregateId=${aggregateId}`)
    const value = JSON.stringify({
      aggregateId,
      events: events.map(e => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
      publishedAt: new Date().toISOString(),
    })
    await this.producer.send({
      topic: this.topic,
      messages: [{ key: aggregateId, value }],
    })
    kafkaPublishedTotal.add(events.length, { topic: this.topic })
    console.log(`[kafka:publisher] published → topic="${this.topic}" aggregateId=${aggregateId}`)
  }
}

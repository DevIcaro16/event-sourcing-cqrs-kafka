import type { Kafka, Producer } from 'kafkajs'
import type { MessagePublisher } from '../../application/ports/MessagePublisher'
import type { DomainEvent } from '../../domain/shared/DomainEvent'
import { kafkaPublishedTotal } from '../telemetry/metrics'
import { propagation, context, trace, SpanKind } from '@opentelemetry/api'

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
    const tracer = trace.getTracer('banking-kafka')
    const span = tracer.startSpan(`kafka.publish ${this.topic}`, {
      kind: SpanKind.PRODUCER,
      attributes: {
        'messaging.system': 'kafka',
        'messaging.destination': this.topic,
        'messaging.aggregate_id': aggregateId,
        'messaging.event_count': events.length,
      },
    })

    await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const types = events.map(e => e.type).join(', ')
        console.log(`[kafka:publisher] publishing ${events.length} event(s) [${types}] → aggregateId=${aggregateId}`)

        const headers: Record<string, string> = {}
        propagation.inject(context.active(), headers)

        const value = JSON.stringify({
          aggregateId,
          events: events.map(e => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
          publishedAt: new Date().toISOString(),
        })

        await this.producer.send({
          topic: this.topic,
          messages: [{ key: aggregateId, value, headers }],
        })

        kafkaPublishedTotal.add(events.length, { topic: this.topic })
        console.log(`[kafka:publisher] published → topic="${this.topic}" aggregateId=${aggregateId}`)
        span.setStatus({ code: 1 }) // OK
      } catch (err) {
        span.setStatus({ code: 2, message: (err as Error).message }) // ERROR
        throw err
      } finally {
        span.end()
      }
    })
  }
}

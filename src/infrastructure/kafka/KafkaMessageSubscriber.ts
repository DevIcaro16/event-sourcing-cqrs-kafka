import type { Admin, Kafka, Consumer } from 'kafkajs'
import type { MessageSubscriber } from '../../application/ports/MessageSubscriber'
import type { DomainEvent } from '../../domain/shared/DomainEvent'
import { kafkaConsumedTotal, kafkaConsumerLag } from '../telemetry/metrics'

type BrokerMessage = {
  aggregateId: string
  events: Array<Record<string, unknown> & { occurredAt: string }>
  publishedAt: string
}

export class KafkaMessageSubscriber implements MessageSubscriber {
  private admin: Admin
  private groupId: string

  constructor(
    private readonly consumer: Consumer,
    private readonly topic: string,
    kafka: Kafka,
    groupId: string,
  ) {
    this.admin = kafka.admin()
    this.groupId = groupId
  }

  static create(kafka: Kafka, topic: string, groupId: string): KafkaMessageSubscriber {
    return new KafkaMessageSubscriber(kafka.consumer({ groupId }), topic, kafka, groupId)
  }

  async subscribe(
    handler: (events: DomainEvent[], aggregateId: string) => Promise<void>,
  ): Promise<void> {
    await this.admin.connect()
    console.log(`[kafka:consumer] admin connected → topic="${this.topic}"`)

    kafkaConsumerLag.addCallback(async (result) => {
      try {
        const offsets = await this.admin.fetchTopicOffsets(this.topic)
        const groupOffsets = await this.admin.fetchOffsets({ groupId: this.groupId, topics: [this.topic] })
        for (const partition of offsets) {
          const groupPartition = groupOffsets[0]?.partitions.find(p => p.partition === partition.partition)
          const lag = groupPartition
            ? Number(partition.high) - Number(groupPartition.offset)
            : 0
          result.observe(Math.max(0, lag), {
            topic: this.topic,
            partition: String(partition.partition),
            group: this.groupId,
          })
        }
      } catch {
        // admin may not be ready yet
      }
    })

    await this.consumer.connect()
    console.log(`[kafka:consumer] connected → topic="${this.topic}"`)
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false })

    await new Promise<void>((resolve, reject) => {
      this.consumer.on(this.consumer.events.GROUP_JOIN, ({ payload }) => {
        console.log(`[kafka:consumer] joined group → groupId=${payload.groupId} memberId=${payload.memberId}`)
        resolve()
      })
      this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
        console.error(`[kafka:consumer] crash → ${payload.error?.message}`)
        reject(payload.error)
      })
      this.consumer.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
          if (!message.value) return
          const { aggregateId, events }: BrokerMessage = JSON.parse(message.value.toString())
          const types = events.map((e: any) => e.type).join(', ')
          console.log(`[kafka:consumer] received ${events.length} event(s) [${types}] ← aggregateId=${aggregateId} offset=${message.offset}`)
          const parsed = events.map(e => ({ ...e, occurredAt: new Date(e.occurredAt) })) as DomainEvent[]
          await handler(parsed, aggregateId)
          await this.consumer.commitOffsets([{
            topic,
            partition,
            offset: (Number(message.offset) + 1).toString(),
          }])
          kafkaConsumedTotal.add(events.length, { topic, group: this.groupId })
          console.log(`[kafka:consumer] committed offset=${Number(message.offset) + 1} partition=${partition}`)
        },
      }).catch(reject)
    })
  }

  async close(): Promise<void> {
    console.log(`[kafka:consumer] disconnecting...`)
    await this.consumer.disconnect()
    await this.admin.disconnect()
  }
}

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Kafka } from 'kafkajs'
import { KafkaMessagePublisher } from '../../../src/infrastructure/kafka/KafkaMessagePublisher'
import { KafkaMessageSubscriber } from '../../../src/infrastructure/kafka/KafkaMessageSubscriber'
import type { DomainEvent } from '../../../src/domain/shared/DomainEvent'

const KAFKA_BROKERS = (process.env.TEST_KAFKA_BROKERS ?? 'localhost:9093').split(',')
const TEST_TOPIC = `banking.test.events.${Date.now()}`

const kafka      = new Kafka({ clientId: 'banking-test', brokers: KAFKA_BROKERS })
const publisher  = KafkaMessagePublisher.create(kafka, TEST_TOPIC)
const subscriber = KafkaMessageSubscriber.create(kafka, TEST_TOPIC, `banking-test-${Date.now()}`)

let activeHandler: ((events: DomainEvent[], aggregateId: string) => Promise<void>) | null = null

beforeAll(async () => {
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    waitForLeaders: true,
    topics: [{ topic: TEST_TOPIC, numPartitions: 1, replicationFactor: 1 }],
  })
  await admin.disconnect()

  await publisher.connect()
  await subscriber.subscribe(async (events, aggregateId) => {
    await activeHandler?.(events, aggregateId)
  })
  // Aguarda o fetch loop estabilizar após GROUP_JOIN
  await Bun.sleep(1000)
})

afterAll(async () => {
  await subscriber.close()
  await publisher.close()
})

describe('Kafka round-trip: publish → subscribe', () => {
  it('subscriber recebe os eventos publicados com tipos corretos', async () => {
    const receivedEvents: DomainEvent[] = []
    let receivedAggregateId = ''

    activeHandler = async (events, aggregateId) => {
      receivedEvents.push(...events)
      receivedAggregateId = aggregateId
    }

    const aggregateId = `test-acc-${Date.now()}`
    const sentEvents: DomainEvent[] = [
      { type: 'MoneyDeposited', occurredAt: new Date('2026-01-15T10:00:00Z') } as DomainEvent,
    ]
    await publisher.publish(sentEvents, aggregateId)

    // Aguarda até 5s pelo consumer processar
    await Bun.sleep(500)
    for (let i = 0; i < 9 && receivedEvents.length === 0; i++) {
      await Bun.sleep(500)
    }

    expect(receivedAggregateId).toBe(aggregateId)
    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0].type).toBe('MoneyDeposited')
    expect(receivedEvents[0].occurredAt).toBeInstanceOf(Date)
    expect(receivedEvents[0].occurredAt.toISOString()).toBe('2026-01-15T10:00:00.000Z')
  })
})

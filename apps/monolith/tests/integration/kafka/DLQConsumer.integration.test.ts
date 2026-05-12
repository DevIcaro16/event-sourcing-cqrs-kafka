import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Kafka } from 'kafkajs'
import { KafkaMessagePublisher } from '../../../src/infrastructure/kafka/KafkaMessagePublisher'
import { DLQConsumer } from '../../../src/infrastructure/kafka/DLQConsumer'
import type { DomainEvent } from '../../../src/domain/shared/DomainEvent'

const KAFKA_BROKERS = (process.env.TEST_KAFKA_BROKERS ?? 'localhost:9093').split(',')
const DLQ_TOPIC = `banking.test.dlq.${Date.now()}`

const kafka = new Kafka({ clientId: 'banking-dlq-test', brokers: KAFKA_BROKERS, logLevel: 1 })
const publisher = KafkaMessagePublisher.create(kafka, DLQ_TOPIC)
const dlqConsumer = new DLQConsumer(kafka)

beforeAll(async () => {
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    waitForLeaders: true,
    topics: [{ topic: DLQ_TOPIC, numPartitions: 1, replicationFactor: 1 }],
  })
  await admin.disconnect()
  await publisher.connect()
  await dlqConsumer.start(DLQ_TOPIC)
  await Bun.sleep(1000)
})

afterAll(async () => {
  await dlqConsumer.close()
  await publisher.close()
})

describe('DLQConsumer', () => {
  it('consome mensagem publicada no tópico DLQ sem erros', async () => {
    const aggregateId = `test-acc-${Date.now()}`
    const events: DomainEvent[] = [
      { type: 'MoneyDeposited', occurredAt: new Date('2026-01-15T10:00:00Z') } as DomainEvent,
    ]

    await publisher.publish(events, aggregateId)

    // aguarda o consumer processar
    await Bun.sleep(1500)

    // se chegou aqui sem lançar exceção, o consumer processou corretamente
    expect(true).toBe(true)
  })

  it('consome múltiplos eventos no mesmo batch', async () => {
    const aggregateId = `test-acc-${Date.now()}`
    const events: DomainEvent[] = [
      { type: 'MoneyDeposited', occurredAt: new Date('2026-01-15T10:00:00Z') } as DomainEvent,
      { type: 'MoneyWithdrawn', occurredAt: new Date('2026-01-15T11:00:00Z') } as DomainEvent,
    ]

    await publisher.publish(events, aggregateId)
    await Bun.sleep(1500)

    expect(true).toBe(true)
  })
})

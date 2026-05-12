import { describe, it, expect, mock } from 'bun:test'
import { KafkaMessagePublisher } from '../../../../src/infrastructure/kafka/KafkaMessagePublisher'
import type { DomainEvent } from '../../../../src/domain/shared/DomainEvent'

function makeProducer() {
  return {
    connect:    mock(async () => {}),
    disconnect: mock(async () => {}),
    send:       mock(async () => []),
  }
}

describe('KafkaMessagePublisher', () => {
  it('serializa eventos e envia ao topic correto', async () => {
    const producer = makeProducer()
    const publisher = new KafkaMessagePublisher(producer as any, 'banking.account.events')

    const events: DomainEvent[] = [
      { type: 'MoneyDeposited', occurredAt: new Date('2026-01-01T00:00:00Z') } as DomainEvent,
    ]
    await publisher.publish(events, 'acc-123')

    expect(producer.send).toHaveBeenCalledTimes(1)
    const call = (producer.send.mock.calls as any)[0][0]
    expect(call.topic).toBe('banking.account.events')
    expect(call.messages).toHaveLength(1)
    expect(call.messages[0].key).toBe('acc-123')

    const payload = JSON.parse(call.messages[0].value)
    expect(payload.aggregateId).toBe('acc-123')
    expect(payload.events[0].type).toBe('MoneyDeposited')
    expect(payload.events[0].occurredAt).toBe('2026-01-01T00:00:00.000Z')
    expect(typeof payload.publishedAt).toBe('string')
  })

  it('connect e close delegam ao producer', async () => {
    const producer = makeProducer()
    const publisher = new KafkaMessagePublisher(producer as any, 'banking.account.events')

    await publisher.connect()
    expect(producer.connect).toHaveBeenCalledTimes(1)

    await publisher.close()
    expect(producer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('aceita array vazio sem lançar erro', async () => {
    const producer = makeProducer()
    const publisher = new KafkaMessagePublisher(producer as any, 'banking.account.events')
    await publisher.publish([], 'acc-empty')
    const call = (producer.send.mock.calls as any)[0][0]
    expect(JSON.parse(call.messages[0].value).events).toHaveLength(0)
  })
})

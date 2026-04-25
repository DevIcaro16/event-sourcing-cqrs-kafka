import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { OutboxRelay } from '../../../../src/infrastructure/kafka/OutboxRelay'
import type { OutboxEntry } from '../../../../src/infrastructure/postgres/PostgresOutboxStore'
import type { DomainEvent } from '../../../../src/domain/shared/DomainEvent'

function makeOutboxStore(entries: OutboxEntry[] = []) {
  return {
    getPending: mock(async (_limit?: number) => entries),
    markPublished: mock(async (_id: string) => {}),
  }
}

function makePublisher() {
  return {
    publish: mock(async (_events: DomainEvent[], _aggregateId: string) => {}),
  }
}

const sampleEntry: OutboxEntry = {
  id: 'entry-1',
  aggregateId: 'acc-1',
  events: [{ type: 'MoneyDeposited', occurredAt: new Date() } as DomainEvent],
}

describe('OutboxRelay.processOnce', () => {
  it('chama publisher.publish com os eventos e aggregateId corretos', async () => {
    const store = makeOutboxStore([sampleEntry])
    const publisher = makePublisher()
    const relay = new OutboxRelay(store as any, publisher as any, 0)

    await relay.processOnce()

    expect(publisher.publish).toHaveBeenCalledTimes(1)
    const [events, aggregateId] = (publisher.publish.mock.calls as any)[0]
    expect(aggregateId).toBe('acc-1')
    expect(events[0].type).toBe('MoneyDeposited')
  })

  it('chama markPublished após publicação bem-sucedida', async () => {
    const store = makeOutboxStore([sampleEntry])
    const publisher = makePublisher()
    const relay = new OutboxRelay(store as any, publisher as any, 0)

    await relay.processOnce()

    expect(store.markPublished).toHaveBeenCalledTimes(1)
    expect((store.markPublished.mock.calls as any)[0][0]).toBe('entry-1')
  })

  it('não chama markPublished se publisher.publish lança erro', async () => {
    const store = makeOutboxStore([sampleEntry])
    const publisher = {
      publish: mock(async () => { throw new Error('kafka down') }),
    }
    const relay = new OutboxRelay(store as any, publisher as any, 0)

    await relay.processOnce()

    expect(store.markPublished).not.toHaveBeenCalled()
  })

  it('continua processando entradas seguintes mesmo se uma falha', async () => {
    const entry2: OutboxEntry = { id: 'entry-2', aggregateId: 'acc-2', events: [] }
    const store = makeOutboxStore([sampleEntry, entry2])
    let callCount = 0
    const publisher = {
      publish: mock(async () => {
        callCount++
        if (callCount === 1) throw new Error('kafka down')
      }),
    }
    const relay = new OutboxRelay(store as any, publisher as any, 0)

    await relay.processOnce()

    expect(publisher.publish).toHaveBeenCalledTimes(2)
    expect(store.markPublished).toHaveBeenCalledTimes(1)
    expect((store.markPublished.mock.calls as any)[0][0]).toBe('entry-2')
  })

  it('não faz nada se não há entradas pendentes', async () => {
    const store = makeOutboxStore([])
    const publisher = makePublisher()
    const relay = new OutboxRelay(store as any, publisher as any, 0)

    await relay.processOnce()

    expect(publisher.publish).not.toHaveBeenCalled()
    expect(store.markPublished).not.toHaveBeenCalled()
  })
})

import { describe, it, expect } from 'bun:test'
import type { EventEnvelope, EventMetadata } from '../src/envelope'

describe('EventEnvelope', () => {
  it('accepts a strongly-typed payload', () => {
    type Payload = { foo: string }
    const env: EventEnvelope<Payload> = {
      eventId: '11111111-1111-1111-1111-111111111111',
      eventType: 'SomeEvent',
      eventVersion: 1,
      aggregateId: 'acc-1',
      aggregateType: 'Account',
      sequence: 0,
      occurredAt: '2026-05-12T00:00:00.000Z',
      correlationId: 'corr-1',
      causationId: null,
      payload: { foo: 'bar' },
    }
    expect(env.payload.foo).toBe('bar')
    expect(env.causationId).toBeNull()
  })

  it('payload defaults to unknown when type parameter omitted', () => {
    const env: EventEnvelope = {
      eventId: 'e',
      eventType: 't',
      eventVersion: 1,
      aggregateId: 'a',
      aggregateType: 'A',
      sequence: 1,
      occurredAt: '2026-05-12T00:00:00.000Z',
      correlationId: 'c',
      causationId: 'cause-1',
      payload: { anything: true },
    }
    expect(env.causationId).toBe('cause-1')
  })

  it('EventMetadata holds traceability fields', () => {
    const meta: EventMetadata = {
      eventId: 'e',
      eventType: 't',
      eventVersion: 1,
      aggregateId: 'a',
      aggregateType: 'A',
      sequence: 0,
      occurredAt: '2026-05-12T00:00:00.000Z',
      correlationId: 'c',
      causationId: null,
    }
    expect(meta.eventVersion).toBe(1)
  })
})

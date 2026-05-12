import { describe, it, expect, beforeAll } from 'bun:test'
import { context, propagation, trace } from '@opentelemetry/api'
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  trace.setGlobalTracerProvider(new BasicTracerProvider())
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
})

describe('W3C trace propagation via Kafka headers', () => {
  it('inject coloca traceparent nos headers', async () => {
    const headers: Record<string, string> = {}

    await trace.getTracer('test').startActiveSpan('test-span', async (span) => {
      propagation.inject(context.active(), headers)
      span.end()
    })

    expect(headers['traceparent']).toBeDefined()
    expect(headers['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-\d{2}$/)
  })

  it('extract recupera o mesmo traceId do header injetado', async () => {
    const headers: Record<string, string> = {}
    let traceId = ''

    await trace.getTracer('test').startActiveSpan('producer-span', async (span) => {
      traceId = span.spanContext().traceId
      propagation.inject(context.active(), headers)
      span.end()
    })

    const extracted = propagation.extract(context.active(), headers)
    const extractedSpan = trace.getSpan(extracted)
    expect(extractedSpan?.spanContext().traceId).toBe(traceId)
  })

  it('extract em headers vazios retorna contexto sem span válido', () => {
    const extracted = propagation.extract(context.active(), {})
    const span = trace.getSpan(extracted)
    expect(span).toBeUndefined()
  })

  it('traceparent segue o formato W3C — 00-traceId-spanId-flags', async () => {
    const headers: Record<string, string> = {}

    await trace.getTracer('test').startActiveSpan('format-test', async (span) => {
      propagation.inject(context.active(), headers)
      span.end()
    })

    const parts = headers['traceparent'].split('-')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('00')
    expect(parts[1]).toHaveLength(32)
    expect(parts[2]).toHaveLength(16)
    expect(parts[3]).toHaveLength(2)
  })
})

import { describe, it, expect, mock } from 'bun:test'
import { OtelMetricsAdapter } from '../../../src/infrastructure/telemetry/OtelMetricsAdapter'

function makeCounter() {
  return { add: mock((_value: number, _attrs?: Record<string, string>) => {}) }
}

function makeHistogram() {
  return { record: mock((_value: number, _attrs?: Record<string, string>) => {}) }
}

describe('OtelMetricsAdapter', () => {
  it('chama counter.add(1, attrs) ao incrementar uma métrica conhecida', () => {
    const counter = makeCounter()
    const adapter = new OtelMetricsAdapter({ my_counter: counter }, {})

    adapter.increment('my_counter', { type: 'deposit' })

    expect(counter.add).toHaveBeenCalledTimes(1)
    expect(counter.add).toHaveBeenCalledWith(1, { type: 'deposit' })
  })

  it('ignora silenciosamente increment para métrica desconhecida', () => {
    const adapter = new OtelMetricsAdapter({}, {})
    expect(() => adapter.increment('inexistente')).not.toThrow()
  })

  it('chama histogram.record(value, attrs) ao registrar uma métrica conhecida', () => {
    const histogram = makeHistogram()
    const adapter = new OtelMetricsAdapter({}, { my_histogram: histogram })

    adapter.record('my_histogram', 250, { type: 'transfer' })

    expect(histogram.record).toHaveBeenCalledTimes(1)
    expect(histogram.record).toHaveBeenCalledWith(250, { type: 'transfer' })
  })

  it('ignora silenciosamente record para métrica desconhecida', () => {
    const adapter = new OtelMetricsAdapter({}, {})
    expect(() => adapter.record('inexistente', 100)).not.toThrow()
  })

  it('funciona sem attributes opcionais', () => {
    const counter = makeCounter()
    const adapter = new OtelMetricsAdapter({ c: counter }, {})

    adapter.increment('c')

    expect(counter.add).toHaveBeenCalledWith(1, undefined)
  })
})

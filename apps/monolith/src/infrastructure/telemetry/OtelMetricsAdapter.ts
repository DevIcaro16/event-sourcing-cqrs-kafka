import type { MetricsPort } from '../../application/ports/MetricsPort'

type Counter = { add(value: number, attributes?: Record<string, string>): void }
type Histogram = { record(value: number, attributes?: Record<string, string>): void }

export class OtelMetricsAdapter implements MetricsPort {
  constructor(
    private readonly counters: Record<string, Counter>,
    private readonly histograms: Record<string, Histogram>,
  ) {}

  increment(name: string, attributes?: Record<string, string>): void {
    this.counters[name]?.add(1, attributes)
  }

  record(name: string, value: number, attributes?: Record<string, string>): void {
    this.histograms[name]?.record(value, attributes)
  }
}

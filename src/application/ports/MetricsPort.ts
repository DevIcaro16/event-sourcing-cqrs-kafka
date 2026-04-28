export interface MetricsPort {
  increment(name: string, attributes?: Record<string, string>): void
  record(name: string, value: number, attributes?: Record<string, string>): void
}

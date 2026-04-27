export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super('Circuit breaker is OPEN — dependency unavailable')
    this.name = 'CircuitBreakerOpenError'
  }
}

export interface CircuitBreakerOptions {
  threshold: number    // falhas consecutivas para abrir o circuito
  recoveryMs: number   // tempo em OPEN antes de tentar HALF_OPEN
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED'
  private failures = 0
  private openedAt: number | null = null

  constructor(
    private readonly options: CircuitBreakerOptions,
    private readonly onStateChange?: (state: CircuitBreakerState) => void,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt! >= this.options.recoveryMs) {
        this.transition('HALF_OPEN')
      } else {
        throw new CircuitBreakerOpenError()
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    }
  }

  getState(): CircuitBreakerState {
    return this.state
  }

  private onSuccess(): void {
    this.failures = 0
    if (this.state === 'HALF_OPEN') this.transition('CLOSED')
  }

  private onFailure(): void {
    this.failures++
    if (this.state === 'HALF_OPEN' || this.failures >= this.options.threshold) {
      this.openedAt = Date.now()
      this.transition('OPEN')
    }
  }

  private transition(next: CircuitBreakerState): void {
    this.state = next
    this.onStateChange?.(next)
  }
}

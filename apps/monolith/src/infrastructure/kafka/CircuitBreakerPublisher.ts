import type { MessagePublisher } from '../../application/ports/MessagePublisher'
import type { DomainEvent } from '../../domain/shared/DomainEvent'
import { CircuitBreaker, type CircuitBreakerOptions } from '../CircuitBreaker'
import { circuitBreakerState } from '../telemetry/metrics'

export class CircuitBreakerPublisher implements MessagePublisher {
  private readonly breaker: CircuitBreaker

  constructor(
    private readonly publisher: MessagePublisher,
    options: CircuitBreakerOptions,
    private readonly name: string = 'kafka-publisher',
  ) {
    this.breaker = new CircuitBreaker(options, (state) => {
      console.warn(`[circuit-breaker] ${this.name} → ${state}`)
      circuitBreakerState.add(state === 'OPEN' ? 1 : -1, { name: this.name })
    })
  }

  async publish(events: DomainEvent[], aggregateId: string): Promise<void> {
    await this.breaker.execute(() => this.publisher.publish(events, aggregateId))
  }

  getState() {
    return this.breaker.getState()
  }
}

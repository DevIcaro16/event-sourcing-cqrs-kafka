import type { SagaStore, TransferSaga } from '../../application/ports/SagaStore'
import type { EventStore } from '../../application/ports/EventStore'
import type { SnapshotStore } from '../../application/ports/SnapshotStore'
import { loadAccount } from '../../application/commands/_loadAccount'
import { AccountNotFoundError, ConcurrencyError } from '../../domain/account/AccountErrors'

const MAX_ATTEMPTS = 3
const MAX_CONCURRENCY_RETRIES = 3

export class SagaRetryWorker {
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly sagaStore: SagaStore,
    private readonly eventStore: EventStore,
    private readonly snapshotStore: SnapshotStore,
    private readonly intervalMs: number = 2000,
  ) { }

  start(): void {
    this.running = true
    this.schedule()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private schedule(): void {
    if (!this.running) return
    this.timer = setTimeout(async () => {
      try {
        await this.processOnce()
      } catch (err) {
        console.error('SagaRetryWorker: processOnce failed, will retry on next tick', err)
      }
      this.schedule()
    }, this.intervalMs)
  }

  async processOnce(): Promise<void> {
    const sagas = await this.sagaStore.getPendingRetries()
    for (const saga of sagas) {
      await this.retrySaga(saga)
    }
  }

  private async retrySaga(saga: TransferSaga): Promise<void> {
    for (let i = 0; i < MAX_CONCURRENCY_RETRIES; i++) {
      try {
        const to = await loadAccount(saga.toAccountId, this.eventStore, this.snapshotStore)
        to.receiveTransfer(saga.fromAccountId, saga.amount)
        await this.eventStore.append(saga.toAccountId, 'Account', to.pendingEvents, to.baseVersion)
        await this.sagaStore.update(saga.sagaId, { status: 'COMPLETED', attempt: saga.attempt, nextRetryAt: null })
        return
      } catch (err) {
        if (err instanceof ConcurrencyError && i < MAX_CONCURRENCY_RETRIES - 1) continue
        if (err instanceof AccountNotFoundError) {
          await this.compensate(saga)
          return
        }
        const newAttempt = saga.attempt + 1
        if (newAttempt >= MAX_ATTEMPTS) {
          await this.compensate(saga)
        } else {
          const delayMs = Math.pow(2, newAttempt) * 1000
          await this.sagaStore.update(saga.sagaId, {
            status: 'RETRY',
            attempt: newAttempt,
            nextRetryAt: new Date(Date.now() + delayMs),
          })
        }
        return
      }
    }
  }

  private async compensate(saga: TransferSaga): Promise<void> {
    for (let i = 0; i < MAX_CONCURRENCY_RETRIES; i++) {
      try {
        const from = await loadAccount(saga.fromAccountId, this.eventStore, this.snapshotStore)
        from.compensateTransfer(saga.toAccountId, saga.amount, saga.sagaId)
        await this.eventStore.append(saga.fromAccountId, 'Account', from.pendingEvents, from.baseVersion)
        await this.sagaStore.update(saga.sagaId, { status: 'FAILED', attempt: saga.attempt, nextRetryAt: null })
        return
      } catch (err) {
        if (err instanceof ConcurrencyError && i < MAX_CONCURRENCY_RETRIES - 1) continue
        console.error(`SagaRetryWorker: compensação falhou para saga ${saga.sagaId}`, err)
        try {
          await this.sagaStore.update(saga.sagaId, { status: 'FAILED', attempt: saga.attempt, nextRetryAt: null })
        } catch (updateErr) {
          console.error(`SagaRetryWorker: could not mark saga FAILED`, updateErr)
        }
        return
      }
    }
  }
}

import type { SagaStore } from '../../application/ports/SagaStore'
import type { EventStore } from '../../application/ports/EventStore'
import type { SnapshotStore } from '../../application/ports/SnapshotStore'
import type { TransferInitiated } from '../../domain/account/AccountEvents'
import type { DomainEvent } from '../../domain/shared/DomainEvent'
import { loadAccount } from '../../application/commands/_loadAccount'
import { ConcurrencyError } from '../../application/ports/EventStore'
import { AccountNotFoundError } from '../../domain/account/AccountErrors'

const MAX_CONCURRENCY_RETRIES = 3

export class TransferSagaConsumer {
  constructor(
    private readonly sagaStore: SagaStore,
    private readonly eventStore: EventStore,
    private readonly snapshotStore: SnapshotStore,
  ) {}

  async handleEvent(event: DomainEvent): Promise<void> {
    if (event.type !== 'TransferInitiated') return
    await this.handleTransferInitiated(event as TransferInitiated)
  }

  private async handleTransferInitiated(event: TransferInitiated): Promise<void> {
    const { sagaId, fromAccountId, toAccountId, amount } = event

    const existing = await this.sagaStore.findById(sagaId)
    if (existing?.status === 'COMPLETED' || existing?.status === 'FAILED') return

    if (!existing) {
      await this.sagaStore.create({ sagaId, fromAccountId, toAccountId, amount, status: 'PENDING', attempt: 0, nextRetryAt: null })
    }

    for (let i = 0; i < MAX_CONCURRENCY_RETRIES; i++) {
      try {
        const to = await loadAccount(toAccountId, this.eventStore, this.snapshotStore)
        to.receiveTransfer(fromAccountId, amount)
        await this.eventStore.append(toAccountId, 'Account', to.pendingEvents, to.baseVersion)
        await this.sagaStore.update(sagaId, { status: 'COMPLETED', attempt: 0, nextRetryAt: null })
        return
      } catch (err) {
        if (err instanceof ConcurrencyError && i < MAX_CONCURRENCY_RETRIES - 1) continue
        if (err instanceof AccountNotFoundError) {
          await this.compensate(sagaId, fromAccountId, toAccountId, amount)
          return
        }
        await this.sagaStore.update(sagaId, { status: 'RETRY', attempt: 1, nextRetryAt: new Date(Date.now() + 2000) })
        return
      }
    }
  }

  async compensate(sagaId: string, fromAccountId: string, toAccountId: string, amount: number): Promise<void> {
    for (let i = 0; i < MAX_CONCURRENCY_RETRIES; i++) {
      try {
        const from = await loadAccount(fromAccountId, this.eventStore, this.snapshotStore)
        from.compensateTransfer(toAccountId, amount, sagaId)
        await this.eventStore.append(fromAccountId, 'Account', from.pendingEvents, from.baseVersion)
        await this.sagaStore.update(sagaId, { status: 'FAILED', attempt: 0, nextRetryAt: null })
        return
      } catch (err) {
        if (err instanceof ConcurrencyError && i < MAX_CONCURRENCY_RETRIES - 1) continue
        throw err
      }
    }
  }
}

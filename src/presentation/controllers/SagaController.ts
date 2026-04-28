import type { SagaStore } from '../../application/ports/SagaStore'

export class SagaController {
  constructor(private readonly sagaStore: SagaStore) {}

  async getSaga(sagaId: string) {
    const saga = await this.sagaStore.findById(sagaId)
    if (!saga) {
      const err = new Error(`Saga not found: ${sagaId}`)
      err.name = 'SagaNotFoundError'
      throw err
    }
    return {
      sagaId:        saga.sagaId,
      fromAccountId: saga.fromAccountId,
      toAccountId:   saga.toAccountId,
      amount:        saga.amount,
      status:        saga.status,
      attempt:       saga.attempt,
      createdAt:     saga.createdAt,
    }
  }
}

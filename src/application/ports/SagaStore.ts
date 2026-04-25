export type SagaStatus = 'PENDING' | 'COMPLETED' | 'RETRY' | 'FAILED'

export type TransferSaga = {
  sagaId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  status: SagaStatus
  attempt: number
  nextRetryAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SagaStore {
  create(saga: Omit<TransferSaga, 'createdAt' | 'updatedAt'>): Promise<void>
  update(sagaId: string, patch: { status: SagaStatus; attempt: number; nextRetryAt: Date | null }): Promise<void>
  getPendingRetries(): Promise<TransferSaga[]>
  findById(sagaId: string): Promise<TransferSaga | null>
}

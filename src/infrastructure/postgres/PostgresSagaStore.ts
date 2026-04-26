import type postgres from 'postgres'
import type { SagaStore, TransferSaga, SagaStatus } from '../../application/ports/SagaStore'

type SagaRow = {
  saga_id: string
  from_account_id: string
  to_account_id: string
  amount: string
  status: string
  attempt: number
  next_retry_at: Date | null
  created_at: Date
  updated_at: Date
}

function mapRow(row: SagaRow): TransferSaga {
  return {
    sagaId: row.saga_id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amount: Number(row.amount),
    status: row.status as SagaStatus,
    attempt: row.attempt,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PostgresSagaStore implements SagaStore {
  constructor(private readonly sql: postgres.Sql) {}

  async create(saga: Omit<TransferSaga, 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.sql`
      INSERT INTO transfer_sagas (saga_id, from_account_id, to_account_id, amount, status, attempt, next_retry_at)
      VALUES (${saga.sagaId}, ${saga.fromAccountId}, ${saga.toAccountId}, ${saga.amount}, ${saga.status}, ${saga.attempt}, ${saga.nextRetryAt ?? null})
      ON CONFLICT (saga_id) DO NOTHING
    `
  }

  async update(sagaId: string, patch: { status: SagaStatus; attempt: number; nextRetryAt: Date | null }): Promise<void> {
    const result = await this.sql<{ saga_id: string }[]>`
      UPDATE transfer_sagas
      SET status = ${patch.status}, attempt = ${patch.attempt}, next_retry_at = ${patch.nextRetryAt}, updated_at = NOW()
      WHERE saga_id = ${sagaId}
      RETURNING saga_id
    `
    if (result.length === 0) {
      throw new Error(`SagaStore.update: saga not found: ${sagaId}`)
    }
  }

  async getPendingRetries(): Promise<TransferSaga[]> {
    const rows = await this.sql<SagaRow[]>`
      SELECT saga_id, from_account_id, to_account_id, amount, status, attempt, next_retry_at, created_at, updated_at
      FROM transfer_sagas
      WHERE status = 'RETRY' AND next_retry_at <= NOW()
      LIMIT 100
    `
    return rows.map(mapRow)
  }

  async findById(sagaId: string): Promise<TransferSaga | null> {
    const rows = await this.sql<SagaRow[]>`
      SELECT saga_id, from_account_id, to_account_id, amount, status, attempt, next_retry_at, created_at, updated_at
      FROM transfer_sagas WHERE saga_id = ${sagaId}
    `
    return rows[0] ? mapRow(rows[0]) : null
  }
}

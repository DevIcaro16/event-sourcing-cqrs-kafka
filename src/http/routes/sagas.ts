// src/http/routes/sagas.ts
import { Elysia, t } from 'elysia'
import type { SagaStore } from '../../application/ports/SagaStore'

export function sagaRoutes(sagaStore: SagaStore) {
  return new Elysia({ prefix: '/sagas' })
    .get(
      '/:sagaId',
      async ({ params, set }) => {
        const saga = await sagaStore.findById(params.sagaId)
        if (!saga) {
          set.status = 404
          return { error: 'NotFound', message: `Saga not found: ${params.sagaId}` }
        }
        return {
          sagaId:         saga.sagaId,
          fromAccountId:  saga.fromAccountId,
          toAccountId:    saga.toAccountId,
          amount:         saga.amount,
          status:         saga.status,
          attempt:        saga.attempt,
          createdAt:      saga.createdAt,
        }
      },
      {
        detail: {
          tags: ['Sagas'],
          summary: 'Status da saga',
          description: 'Retorna o status atual de uma saga de transferência.',
        },
      }
    )
}

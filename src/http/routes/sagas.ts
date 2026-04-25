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
        response: {
          200: t.Object({
            sagaId:        t.String(),
            fromAccountId: t.String(),
            toAccountId:   t.String(),
            amount:        t.Number(),
            status:        t.String(),
            attempt:       t.Number(),
            createdAt:     t.Date(),
          }),
          404: t.Object({
            error:   t.String(),
            message: t.String(),
          }),
        },
        detail: {
          tags: ['Sagas'],
          summary: 'Status da saga',
          description: 'Retorna o status atual de uma saga de transferência.',
        },
      }
    )
}

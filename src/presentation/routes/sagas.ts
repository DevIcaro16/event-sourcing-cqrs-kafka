import { Elysia, t } from 'elysia'
import type { SagaController } from '../controllers/SagaController'

export function sagaRoutes(controller: SagaController) {
  return new Elysia({ prefix: '/sagas' })
    .get(
      '/:sagaId',
      ({ params }) => controller.getSaga(params.sagaId),
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
      },
    )
}

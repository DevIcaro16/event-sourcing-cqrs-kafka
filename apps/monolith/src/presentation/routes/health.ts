import { Elysia, t } from 'elysia'
import type { HealthController } from '../controllers/HealthController'

const tags = ['Health']

const HealthResponse = t.Object({
  status: t.Union([t.Literal('ok'), t.Literal('degraded')]),
  checks: t.Optional(t.Object({
    postgres_write: t.Union([t.Literal('ok'), t.Literal('fail')]),
    postgres_read:  t.Union([t.Literal('ok'), t.Literal('fail')]),
    redis:          t.Union([t.Literal('ok'), t.Literal('fail')]),
    kafka:          t.Union([t.Literal('ok'), t.Literal('fail')]),
  })),
})

export function healthRoutes(controller: HealthController) {
  return new Elysia({ prefix: '/health' })
    .get('/live', () => ({ status: 'ok' as const }), {
      response: HealthResponse,
      detail: {
        tags,
        summary: 'Liveness',
        description: 'Retorna 200 se o processo está no ar.',
      },
    })
    .get('/ready', async ({ set }) => {
      const result = await controller.checkReadiness()
      if (!result.checks || Object.values(result.checks).some(v => v === 'fail')) set.status = 503
      return result
    }, {
      response: HealthResponse,
      detail: {
        tags,
        summary: 'Readiness',
        description: 'Retorna 200 se todas as dependências estão acessíveis (postgres_write, postgres_read, redis, kafka). Retorna 503 se alguma falhar.',
      },
    })
}

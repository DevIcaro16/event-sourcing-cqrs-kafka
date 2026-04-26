import { Elysia, t } from 'elysia'
import type { Sql } from 'postgres'
import type Redis from 'ioredis'
import type { Kafka } from 'kafkajs'

type CheckStatus = 'ok' | 'fail'

const HealthResponse = t.Object({
  status: t.Union([t.Literal('ok'), t.Literal('degraded')]),
  checks: t.Optional(t.Object({
    postgres_write: t.Union([t.Literal('ok'), t.Literal('fail')]),
    postgres_read: t.Union([t.Literal('ok'), t.Literal('fail')]),
    redis: t.Union([t.Literal('ok'), t.Literal('fail')]),
    kafka: t.Union([t.Literal('ok'), t.Literal('fail')]),
  })),
})

export function healthRoutes(writeSql: Sql, readSql: Sql, redis: Redis, kafka: Kafka) {
  return new Elysia({ prefix: '/health' })
    .get('/live', () => ({ status: 'ok' as const }), {
      response: HealthResponse,
    })
    .get('/ready', async ({ set }) => {
      const checks: Record<string, CheckStatus> = {}

      await Promise.allSettled([
        writeSql`SELECT 1`.then(() => { checks.postgres_write = 'ok' }).catch(() => { checks.postgres_write = 'fail' }),
        readSql`SELECT 1`.then(() => { checks.postgres_read = 'ok' }).catch(() => { checks.postgres_read = 'fail' }),
        redis.ping().then(() => { checks.redis = 'ok' }).catch(() => { checks.redis = 'fail' }),
        (async () => {
          const admin = kafka.admin()
          try {
            await admin.connect()
            await admin.disconnect()
            checks.kafka = 'ok'
          } catch {
            checks.kafka = 'fail'
          }
        })(),
      ])

      const healthy = Object.values(checks).every(v => v === 'ok')
      if (!healthy) set.status = 503

      return {
        status: healthy ? 'ok' as const : 'degraded' as const,
        checks: checks as {
          postgres_write: CheckStatus
          postgres_read: CheckStatus
          redis: CheckStatus
          kafka: CheckStatus
        },
      }
    }, {
      response: HealthResponse,
    })
}

import type { Sql } from 'postgres'
import type Redis from 'ioredis'
import type { Kafka } from 'kafkajs'

type CheckStatus = 'ok' | 'fail'

export interface ReadinessResult {
  status: 'ok' | 'degraded'
  checks: {
    postgres_write: CheckStatus
    postgres_read: CheckStatus
    redis: CheckStatus
    kafka: CheckStatus
  }
}

export class HealthController {
  constructor(
    private readonly writeSql: Sql,
    private readonly readSql: Sql,
    private readonly redis: Redis,
    private readonly kafka: Kafka,
  ) {}

  async checkReadiness(): Promise<ReadinessResult> {
    const checks: Record<string, CheckStatus> = {}

    await Promise.allSettled([
      this.writeSql`SELECT 1`.then(() => { checks.postgres_write = 'ok' }).catch(() => { checks.postgres_write = 'fail' }),
      this.readSql`SELECT 1`.then(() => { checks.postgres_read = 'ok' }).catch(() => { checks.postgres_read = 'fail' }),
      this.redis.ping().then(() => { checks.redis = 'ok' }).catch(() => { checks.redis = 'fail' }),
      (async () => {
        const admin = this.kafka.admin()
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
    return {
      status: healthy ? 'ok' : 'degraded',
      checks: checks as ReadinessResult['checks'],
    }
  }
}

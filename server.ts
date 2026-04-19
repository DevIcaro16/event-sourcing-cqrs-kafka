import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import postgres from 'postgres'
import Redis from 'ioredis'
import { PostgresEventStore } from './src/infrastructure/postgres/PostgresEventStore'
import { DrizzleReadModelStore } from './src/infrastructure/postgres/read/DrizzleReadModelStore'
import { RedisSnapshotStore } from './src/infrastructure/redis/RedisSnapshotStore'
import { RedisReadModelCache } from './src/infrastructure/redis/RedisReadModelCache'
import { RedisCacheInvalidator } from './src/infrastructure/redis/RedisCacheInvalidator'
import { AccountProjector } from './src/application/projectors/AccountProjector'
import { accountRoutes } from './src/http/routes/accounts'

const DATABASE_URL      = process.env.DATABASE_URL      ?? 'postgres://postgres:postgres@localhost:5432/banking'
const READ_DATABASE_URL = process.env.READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/banking_read'
const REDIS_URL         = process.env.REDIS_URL         ?? 'redis://localhost:6381'
const READ_MODEL_CACHE_TTL = Number(process.env.READ_MODEL_CACHE_TTL ?? 60)
const PORT              = Number(process.env.PORT ?? 3000)

const writeSql = postgres(DATABASE_URL)
const readSql  = postgres(READ_DATABASE_URL)
const redis    = new Redis(REDIS_URL)

const eventStore         = new PostgresEventStore(writeSql)
const drizzleReadStore   = new DrizzleReadModelStore(readSql)
const snapshotStore      = new RedisSnapshotStore(redis)
const cacheInvalidator   = new RedisCacheInvalidator(redis)
const projector          = new AccountProjector(drizzleReadStore, cacheInvalidator)
const readStoreWithCache = new RedisReadModelCache(drizzleReadStore, redis, READ_MODEL_CACHE_TTL)

const deps = { eventStore, snapshotStore, projector }

new Elysia()
  .use(swagger({
    documentation: {
      info: {
        title: 'Banking Event Sourcing API',
        version: '0.2.0',
        description: 'API bancária com Event Sourcing e CQRS. Comandos retornam 202 (async); consultas leem do read model (Redis + Postgres).',
      },
      tags: [{ name: 'Accounts', description: 'Operações de conta bancária' }],
    },
  }))
  .use(accountRoutes(deps, readStoreWithCache))
  .listen(PORT, () => {
    console.log(`Banking API running on port ${PORT}`)
    console.log(`Swagger UI: http://localhost:${PORT}/swagger`)
  })

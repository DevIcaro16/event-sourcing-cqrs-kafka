import { Elysia } from 'elysia'
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
  .use(accountRoutes(deps, readStoreWithCache))
  .listen(PORT, () => {
    console.log(`Banking API running on port ${PORT}`)
  })

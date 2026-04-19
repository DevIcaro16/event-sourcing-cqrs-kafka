// server.ts
import { Elysia } from 'elysia'
import postgres from 'postgres'
import { PostgresEventStore } from './src/infrastructure/postgres/PostgresEventStore'
import { accountRoutes } from './src/http/routes/accounts'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/banking'

const sql = postgres(DATABASE_URL)
const eventStore = new PostgresEventStore(sql)

const app = new Elysia()
  .use(accountRoutes(eventStore))
  .listen(3000)

console.log(`Banking Event Sourcing running on http://localhost:3000`)

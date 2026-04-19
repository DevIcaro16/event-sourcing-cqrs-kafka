import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const sql = postgres(process.env.READ_DATABASE_URL!)
const db = drizzle(sql)
await migrate(db, { migrationsFolder: './src/infrastructure/postgres/read/migrations' })
console.log('Read DB migrations applied.')
await sql.end()

import postgres from 'postgres'
import { readFileSync } from 'fs'

const writeUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/banking'
const readUrl = process.env.READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5434/banking_read'

const writeSchema = readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8')
const readSchema = readFileSync('./src/infrastructure/postgres/read/read-schema.sql', 'utf-8')

const writeSql = postgres(writeUrl)
await writeSql.unsafe(writeSchema)
console.log('[migrate] write DB schema applied.')
await writeSql.end()

const readSql = postgres(readUrl)
await readSql.unsafe(readSchema)
console.log('[migrate] read DB schema applied.')
await readSql.end()

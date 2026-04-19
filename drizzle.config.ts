import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/infrastructure/postgres/read/schema.ts',
  out: './src/infrastructure/postgres/read/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.READ_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/banking_read',
  },
})

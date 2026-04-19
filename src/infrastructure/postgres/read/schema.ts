import { pgTable, uuid, text, numeric, bigint, timestamp, index } from 'drizzle-orm/pg-core'

export const accountBalances = pgTable('account_balances', {
  accountId:        uuid('account_id').primaryKey(),
  ownerId:          text('owner_id').notNull(),
  balance:          numeric('balance').notNull(),
  availableBalance: numeric('available_balance').notNull(),
  lockedBalance:    numeric('locked_balance').notNull().default('0'),
  lastEventSeq:     bigint('last_event_seq', { mode: 'number' }).notNull().default(0),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accountTransactions = pgTable('account_transactions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  accountId:    uuid('account_id').notNull(),
  eventType:    text('event_type').notNull(),
  amount:       numeric('amount'),
  balanceAfter: numeric('balance_after'),
  description:  text('description'),
  occurredAt:   timestamp('occurred_at', { withTimezone: true }).notNull(),
}, (t) => [
  index('idx_transactions_account_date_type').on(t.accountId, t.occurredAt, t.eventType),
])

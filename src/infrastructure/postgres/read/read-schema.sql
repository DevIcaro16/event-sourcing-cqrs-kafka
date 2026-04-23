-- src/infrastructure/postgres/read/read-schema.sql
CREATE TABLE IF NOT EXISTS account_balances (
  account_id        UUID PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  balance           NUMERIC NOT NULL,
  available_balance NUMERIC NOT NULL,
  locked_balance    NUMERIC NOT NULL DEFAULT 0,
  last_event_seq    BIGINT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL,
  event_type    TEXT NOT NULL,
  amount        NUMERIC,
  balance_after NUMERIC,
  description   TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_date_type
  ON account_transactions (account_id, occurred_at, event_type);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id     TEXT        PRIMARY KEY,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

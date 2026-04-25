-- src/infrastructure/postgres/schema.sql
CREATE TABLE IF NOT EXISTS events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id    UUID        NOT NULL,
  aggregate_type  TEXT        NOT NULL,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  sequence_number BIGINT      NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_aggregate_sequence
    UNIQUE (aggregate_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_events_aggregate
  ON events (aggregate_id, sequence_number ASC);

CREATE TABLE IF NOT EXISTS outbox (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id  UUID        NOT NULL,
  events        JSONB       NOT NULL,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox (created_at ASC)
  WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         TEXT        NOT NULL,
  route       TEXT        NOT NULL,
  response    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  PRIMARY KEY (key, route)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires
  ON idempotency_keys (expires_at)
  WHERE response IS NOT NULL;

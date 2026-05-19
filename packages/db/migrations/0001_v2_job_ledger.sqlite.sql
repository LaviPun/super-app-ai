-- Platform V2 job ledger — SQLite dialect (local/test).
-- Logical parity with migrations/0001_v2_job_ledger.sql (Postgres).

CREATE TABLE IF NOT EXISTS v2_job_ledger (
  id TEXT PRIMARY KEY,
  shop_id TEXT,
  type TEXT NOT NULL,
  queue_name TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error TEXT,
  idempotency_key TEXT,
  request_id TEXT,
  correlation_id TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS v2_job_ledger_idempotency_key_uq
  ON v2_job_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS v2_job_ledger_status_created_idx
  ON v2_job_ledger (status, created_at);

CREATE INDEX IF NOT EXISTS v2_job_ledger_queue_status_created_idx
  ON v2_job_ledger (queue_name, status, created_at);

CREATE INDEX IF NOT EXISTS v2_job_ledger_shop_created_idx
  ON v2_job_ledger (shop_id, created_at);

CREATE INDEX IF NOT EXISTS v2_job_ledger_correlation_idx
  ON v2_job_ledger (correlation_id);

CREATE TABLE IF NOT EXISTS v2_job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES v2_job_ledger(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  queue_name TEXT NOT NULL,
  progress INTEGER,
  message TEXT,
  metadata_json TEXT,
  request_id TEXT,
  correlation_id TEXT NOT NULL,
  shop_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS v2_job_events_job_created_idx
  ON v2_job_events (job_id, created_at);

CREATE INDEX IF NOT EXISTS v2_job_events_correlation_idx
  ON v2_job_events (correlation_id);

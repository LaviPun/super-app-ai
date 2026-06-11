export const V2_JOB_LEDGER_TABLE = 'v2_job_ledger';
export const V2_JOB_EVENTS_TABLE = 'v2_job_events';

export const V2_JOB_LEDGER_REQUIRED_COLUMNS = [
  'id',
  'shop_id',
  'type',
  'queue_name',
  'status',
  'attempts',
  'payload_json',
  'result_json',
  'error',
  'idempotency_key',
  'request_id',
  'correlation_id',
  'started_at',
  'finished_at',
  'created_at',
  'updated_at',
] as const;

export const V2_JOB_LEDGER_REQUIRED_INDEXES = [
  'v2_job_ledger_idempotency_key_uq',
  'v2_job_ledger_status_created_idx',
  'v2_job_ledger_queue_status_created_idx',
  'v2_job_ledger_shop_created_idx',
  'v2_job_ledger_correlation_idx',
] as const;

export const V2_JOB_EVENTS_REQUIRED_INDEXES = [
  'v2_job_events_job_created_idx',
  'v2_job_events_correlation_idx',
] as const;

export function assertMigrationContract(sql: string, label: string): void {
  for (const column of V2_JOB_LEDGER_REQUIRED_COLUMNS) {
    if (!sql.includes(column)) {
      throw new Error(`${label} migration is missing column: ${column}`);
    }
  }

  for (const index of [...V2_JOB_LEDGER_REQUIRED_INDEXES, ...V2_JOB_EVENTS_REQUIRED_INDEXES]) {
    if (!sql.includes(index)) {
      throw new Error(`${label} migration is missing index: ${index}`);
    }
  }

  if (!sql.includes(V2_JOB_LEDGER_TABLE) || !sql.includes(V2_JOB_EVENTS_TABLE)) {
    throw new Error(`${label} migration is missing required tables`);
  }
}

import type { JobLedgerCreateInput, JobLedgerRecord, JobLedgerRepository, JobLedgerUpdateInput } from './job-ledger.js';

export type SqlJobLedgerRow = {
  id: string;
  shop_id: string | null;
  type: string;
  queue_name: string;
  status: string;
  attempts: number;
  payload_json: unknown;
  result_json: unknown | null;
  error: string | null;
  idempotency_key: string | null;
  request_id: string | null;
  correlation_id: string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type SqlJobLedgerDriver = {
  create(input: JobLedgerCreateInput): Promise<SqlJobLedgerRow>;
  findById(id: string): Promise<SqlJobLedgerRow | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<SqlJobLedgerRow | null>;
  update(id: string, input: JobLedgerUpdateInput): Promise<SqlJobLedgerRow>;
};

export class SqlJobLedgerRepository implements JobLedgerRepository {
  constructor(private readonly driver: SqlJobLedgerDriver) {}

  async create(input: JobLedgerCreateInput): Promise<JobLedgerRecord> {
    return mapSqlJobLedgerRow(await this.driver.create(input));
  }

  async findById(id: string): Promise<JobLedgerRecord | null> {
    const row = await this.driver.findById(id);
    return row ? mapSqlJobLedgerRow(row) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<JobLedgerRecord | null> {
    const row = await this.driver.findByIdempotencyKey(idempotencyKey);
    return row ? mapSqlJobLedgerRow(row) : null;
  }

  async update(id: string, input: JobLedgerUpdateInput): Promise<JobLedgerRecord> {
    return mapSqlJobLedgerRow(await this.driver.update(id, input));
  }
}

export function mapSqlJobLedgerRow(row: SqlJobLedgerRow): JobLedgerRecord {
  return {
    id: row.id,
    type: row.type as JobLedgerRecord['type'],
    queueName: row.queue_name as JobLedgerRecord['queueName'],
    status: row.status as JobLedgerRecord['status'],
    payload: asRecord(row.payload_json),
    trace: {
      requestId: row.request_id ?? undefined,
      correlationId: row.correlation_id,
      shopId: row.shop_id ?? undefined,
    },
    idempotencyKey: row.idempotency_key ?? undefined,
    attempts: row.attempts,
    result: row.result_json === null ? null : asRecord(row.result_json),
    error: row.error,
    startedAt: toIsoOrNull(row.started_at),
    finishedAt: toIsoOrNull(row.finished_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

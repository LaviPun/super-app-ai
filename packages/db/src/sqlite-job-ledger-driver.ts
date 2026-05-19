import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import type { JobLedgerCreateInput, JobLedgerUpdateInput } from './job-ledger.js';
import { applyMigrationStatements, readMigrationSql } from './migrations.js';
import type { SqlJobLedgerDriver, SqlJobLedgerRow } from './sql-job-ledger.js';

export type SqliteJobLedgerDriverOptions = {
  path?: string;
  migrate?: boolean;
};

export function createSqliteJobLedgerDriver(
  options: SqliteJobLedgerDriverOptions = {},
): SqlJobLedgerDriver {
  const path = options.path ?? ':memory:';
  const db = new Database(path);
  db.pragma('foreign_keys = ON');

  if (options.migrate !== false) {
    applyMigrationStatements((statement) => {
      db.exec(statement);
    }, readMigrationSql('sqlite'));
  }

  const insertStmt = db.prepare(`
    INSERT INTO v2_job_ledger (
      id, shop_id, type, queue_name, status, attempts, payload_json, result_json, error,
      idempotency_key, request_id, correlation_id, started_at, finished_at, created_at, updated_at
    ) VALUES (
      @id, @shop_id, @type, @queue_name, @status, @attempts, @payload_json, @result_json, @error,
      @idempotency_key, @request_id, @correlation_id, @started_at, @finished_at, @created_at, @updated_at
    )
  `);

  const findByIdStmt = db.prepare('SELECT * FROM v2_job_ledger WHERE id = ?');
  const findByIdempotencyStmt = db.prepare(
    'SELECT * FROM v2_job_ledger WHERE idempotency_key = ? LIMIT 1',
  );

  return {
    async create(input: JobLedgerCreateInput): Promise<SqlJobLedgerRow> {
      const now = new Date().toISOString();
      const row: SqlJobLedgerRow = {
        id: `job_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        shop_id: input.trace.shopId ?? null,
        type: input.type,
        queue_name: input.queueName,
        status: input.status,
        attempts: 0,
        payload_json: input.payload,
        result_json: null,
        error: null,
        idempotency_key: input.idempotencyKey ?? null,
        request_id: input.trace.requestId ?? null,
        correlation_id: input.trace.correlationId,
        started_at: null,
        finished_at: null,
        created_at: now,
        updated_at: now,
      };

      insertStmt.run({
        id: row.id,
        shop_id: row.shop_id,
        type: row.type,
        queue_name: row.queue_name,
        status: row.status,
        attempts: row.attempts,
        payload_json: JSON.stringify(row.payload_json),
        result_json: null,
        error: row.error,
        idempotency_key: row.idempotency_key,
        request_id: row.request_id,
        correlation_id: row.correlation_id,
        started_at: row.started_at,
        finished_at: row.finished_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });

      return row;
    },

    async findById(id: string): Promise<SqlJobLedgerRow | null> {
      const row = findByIdStmt.get(id) as SqliteRow | undefined;
      return row ? mapSqliteRow(row) : null;
    },

    async findByIdempotencyKey(idempotencyKey: string): Promise<SqlJobLedgerRow | null> {
      const row = findByIdempotencyStmt.get(idempotencyKey) as SqliteRow | undefined;
      return row ? mapSqliteRow(row) : null;
    },

    async update(id: string, input: JobLedgerUpdateInput): Promise<SqlJobLedgerRow> {
      const existing = await this.findById(id);
      if (!existing) throw new Error(`Job ledger record not found: ${id}`);

      const updated: SqlJobLedgerRow = {
        ...existing,
        status: input.status ?? existing.status,
        attempts: input.attempts ?? existing.attempts,
        result_json: input.result === undefined ? existing.result_json : input.result,
        error: input.error === undefined ? existing.error : input.error,
        started_at: input.startedAt === undefined ? existing.started_at : input.startedAt,
        finished_at: input.finishedAt === undefined ? existing.finished_at : input.finishedAt,
        updated_at: new Date().toISOString(),
      };

      db.prepare(`
        UPDATE v2_job_ledger
        SET status = @status,
            attempts = @attempts,
            result_json = @result_json,
            error = @error,
            started_at = @started_at,
            finished_at = @finished_at,
            updated_at = @updated_at
        WHERE id = @id
      `).run({
        id,
        status: updated.status,
        attempts: updated.attempts,
        result_json: updated.result_json === null ? null : JSON.stringify(updated.result_json),
        error: updated.error,
        started_at: updated.started_at,
        finished_at: updated.finished_at,
        updated_at: updated.updated_at,
      });

      return updated;
    },
  };
}

type SqliteRow = {
  id: string;
  shop_id: string | null;
  type: string;
  queue_name: string;
  status: string;
  attempts: number;
  payload_json: string;
  result_json: string | null;
  error: string | null;
  idempotency_key: string | null;
  request_id: string | null;
  correlation_id: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapSqliteRow(row: SqliteRow): SqlJobLedgerRow {
  return {
    id: row.id,
    shop_id: row.shop_id,
    type: row.type,
    queue_name: row.queue_name,
    status: row.status,
    attempts: row.attempts,
    payload_json: parseJson(row.payload_json),
    result_json: row.result_json === null ? null : parseJson(row.result_json),
    error: row.error,
    idempotency_key: row.idempotency_key,
    request_id: row.request_id,
    correlation_id: row.correlation_id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

import { describe, expect, it } from 'vitest';
import { mapSqlJobLedgerRow, SqlJobLedgerRepository, type SqlJobLedgerDriver } from '../sql-job-ledger.js';

describe('SQL job ledger mapping', () => {
  it('maps SQL rows into the shared job ledger contract', () => {
    const createdAt = new Date('2026-05-19T00:00:00.000Z');
    const mapped = mapSqlJobLedgerRow({
      id: 'job-1',
      shop_id: 'shop-1',
      type: 'PUBLISH',
      queue_name: 'publish-execution',
      status: 'QUEUED',
      attempts: 0,
      payload_json: { moduleId: 'mod-1' },
      result_json: null,
      error: null,
      idempotency_key: 'publish-mod-1',
      request_id: 'req-1',
      correlation_id: 'corr-sql-1',
      started_at: null,
      finished_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    });

    expect(mapped).toMatchObject({
      id: 'job-1',
      type: 'PUBLISH',
      queueName: 'publish-execution',
      payload: { moduleId: 'mod-1' },
      trace: { requestId: 'req-1', correlationId: 'corr-sql-1', shopId: 'shop-1' },
      idempotencyKey: 'publish-mod-1',
    });
  });

  it('delegates repository operations to a SQL driver', async () => {
    const now = new Date('2026-05-19T00:00:00.000Z');
    const driver: SqlJobLedgerDriver = {
      async create(input) {
        return {
          id: 'job-2',
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
      },
      async findById() {
        return null;
      },
      async findByIdempotencyKey() {
        return null;
      },
      async update() {
        throw new Error('not used');
      },
    };

    const repository = new SqlJobLedgerRepository(driver);
    const created = await repository.create({
      type: 'WEBHOOK_RECEIVED',
      queueName: 'webhook-processing',
      status: 'QUEUED',
      payload: { shopDomain: 'demo.myshopify.com', topic: 'orders/create', eventId: 'evt-1' },
      trace: { correlationId: 'corr-sql-2' },
    });

    expect(created.queueName).toBe('webhook-processing');
    expect(created.payload.eventId).toBe('evt-1');
  });
});

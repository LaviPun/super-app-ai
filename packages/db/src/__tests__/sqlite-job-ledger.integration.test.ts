import { describe, expect, it } from 'vitest';
import { createJobLedgerRepository } from '../create-job-ledger-repository.js';
import { createQueuedJob } from '../job-ledger.js';

describe('SQLite job ledger repository', () => {
  it('creates, reads, and updates job ledger rows', async () => {
    const repository = createJobLedgerRepository({ driver: 'sqlite', sqlitePath: ':memory:' });
    const { record } = await createQueuedJob(repository, {
      type: 'CONNECTOR_TEST',
      payload: {
        connectorId: 'conn-1',
        shopDomain: 'demo.myshopify.com',
        path: '/health',
      },
      trace: { correlationId: 'corr-sqlite-1', shopId: 'shop-1' },
    });

    const loaded = await repository.findById(record.id);
    expect(loaded?.status).toBe('QUEUED');

    const updated = await repository.update(record.id, {
      status: 'RUNNING',
      attempts: 1,
      startedAt: new Date('2026-05-19T00:00:00.000Z').toISOString(),
    });
    expect(updated).toMatchObject({ status: 'RUNNING', attempts: 1 });
  });

  it('deduplicates by idempotency key across SQLite persistence', async () => {
    const repository = createJobLedgerRepository({ driver: 'sqlite', sqlitePath: ':memory:' });
    const request = {
      type: 'PUBLISH' as const,
      payload: { moduleId: 'mod-sqlite-1' },
      idempotencyKey: 'publish-mod-sqlite-1',
      trace: { correlationId: 'corr-sqlite-2' },
    };

    const first = await createQueuedJob(repository, request);
    const second = await createQueuedJob(repository, request);

    expect(second.deduped).toBe(true);
    expect(second.record.id).toBe(first.record.id);
  });

  it('rejects postgres driver without a database URL', () => {
    expect(() => createJobLedgerRepository({ driver: 'postgres' })).toThrow(/V2_DATABASE_URL/);
  });
});

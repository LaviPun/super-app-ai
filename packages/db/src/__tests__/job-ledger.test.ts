import { describe, expect, it } from 'vitest';
import { createQueuedJob, InMemoryJobLedgerRepository } from '../job-ledger.js';

describe('Job ledger repository', () => {
  it('creates queued jobs with typed payloads and trace context', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const result = await createQueuedJob(repository, {
      type: 'AI_GENERATE',
      payload: { prompt: 'Create a popup' },
      trace: { requestId: 'req-1', correlationId: 'corr-db-1', shopId: 'shop-1' },
    });

    expect(result.deduped).toBe(false);
    expect(result.record).toMatchObject({
      type: 'AI_GENERATE',
      queueName: 'ai-generation',
      status: 'QUEUED',
      attempts: 0,
      trace: { requestId: 'req-1', correlationId: 'corr-db-1', shopId: 'shop-1' },
    });
  });

  it('deduplicates queued jobs by idempotency key', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const request = {
      type: 'PUBLISH' as const,
      payload: { moduleId: 'mod-1' },
      idempotencyKey: 'publish-mod-1',
      trace: { correlationId: 'corr-db-2' },
    };

    const first = await createQueuedJob(repository, request);
    const second = await createQueuedJob(repository, request);

    expect(second.deduped).toBe(true);
    expect(second.record.id).toBe(first.record.id);
  });

  it('updates status, attempts, result, and timestamps', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const { record } = await createQueuedJob(repository, {
      type: 'FLOW_RUN',
      payload: { flowId: 'flow-1', trigger: 'MANUAL' },
      trace: { correlationId: 'corr-db-3' },
    });

    const updated = await repository.update(record.id, {
      status: 'SUCCESS',
      attempts: 1,
      result: { ok: true },
      startedAt: new Date('2026-05-19T00:00:00.000Z').toISOString(),
      finishedAt: new Date('2026-05-19T00:00:01.000Z').toISOString(),
    });

    expect(updated).toMatchObject({
      status: 'SUCCESS',
      attempts: 1,
      result: { ok: true },
    });
  });

  it('rejects invalid payloads before persistence', async () => {
    const repository = new InMemoryJobLedgerRepository();
    await expect(createQueuedJob(repository, {
      type: 'AI_GENERATE',
      payload: {},
      trace: { correlationId: 'corr-db-4' },
    })).rejects.toThrow();
  });
});

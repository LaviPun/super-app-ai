import { describe, expect, it } from 'vitest';
import { InMemoryJobLedgerRepository } from '@superapp/db';
import { InMemoryJobStore, RepositoryJobStore } from '../services/jobs/job-store.js';

describe('JobStore implementations', () => {
  it('deduplicates and updates in-memory job records', async () => {
    const store = new InMemoryJobStore();
    const input = {
      queueName: 'publish-execution' as const,
      request: {
        type: 'PUBLISH' as const,
        payload: { moduleId: 'mod-1' },
        idempotencyKey: 'publish-mod-1',
        trace: { correlationId: 'corr-store-1' },
      },
    };

    const first = await store.createQueued(input);
    const second = await store.createQueued(input);
    expect(second).toMatchObject({ deduped: true });
    expect(second.record.id).toBe(first.record.id);
    expect((await store.updateStatus(first.record.id, 'RUNNING')).status).toBe('RUNNING');
  });

  it('uses the shared db job ledger repository boundary', async () => {
    const store = new RepositoryJobStore(new InMemoryJobLedgerRepository());
    const created = await store.createQueued({
      queueName: 'flow-execution',
      request: {
        type: 'FLOW_RUN',
        payload: { flowId: 'flow-1', trigger: 'MANUAL' },
        idempotencyKey: 'flow-1-manual',
        trace: { requestId: 'req-1', correlationId: 'corr-store-2', shopId: 'shop-1' },
      },
    });

    expect(created.record).toMatchObject({
      type: 'FLOW_RUN',
      queueName: 'flow-execution',
      payload: { flowId: 'flow-1', trigger: 'MANUAL' },
      trace: { requestId: 'req-1', correlationId: 'corr-store-2', shopId: 'shop-1' },
    });
    expect((await store.getByIdempotencyKey('flow-1-manual'))?.id).toBe(created.record.id);
  });
});

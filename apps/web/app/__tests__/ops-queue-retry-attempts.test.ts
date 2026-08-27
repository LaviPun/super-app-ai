import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fix round (Critical #1): proves the real BullMQ `.add()` call (queue mode)
 * receives the per-kind `attempts` from job-retry-policy.ts — not just the
 * Job.maxAttempts DB bookkeeping (covered separately in ops-worker.test.ts).
 * bullmq is mocked wholesale (mirrors worker-runtime.test.ts's pattern) so
 * this never touches a real Redis connection.
 */

const addMock = vi.fn(async () => ({}));
vi.mock('bullmq', () => ({
  Queue: class {
    add = addMock;
  },
  Worker: class {
    on() {
      return this;
    }
  },
}));
vi.mock('@superapp/job-orchestration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@superapp/job-orchestration')>();
  return {
    ...actual,
    createRedisConnection: () => ({ quit: vi.fn(async () => {}) }),
  };
});

const createMock = vi.fn(async (params: { type: string; maxAttempts?: number }) => ({
  id: 'job_q1',
  type: params.type,
  payload: null,
  shopId: 's1',
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    create = createMock;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JOB_EXECUTION_MODE = 'queue';
  process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';
});

describe('enqueueOwnedJob (queue mode) — per-kind BullMQ attempts', () => {
  it('an idempotent kind (LOYALTY_ACCRUAL_RUN) is added with attempts: 3', async () => {
    const { enqueueOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await enqueueOwnedJob({ type: 'LOYALTY_ACCRUAL_RUN', shopId: 's1', payload: {} });
    expect(addMock).toHaveBeenCalledWith(
      'LOYALTY_ACCRUAL_RUN',
      { jobId: 'job_q1' },
      expect.objectContaining({ jobId: 'job_q1', attempts: 3 }),
    );
  });

  it('a non-idempotent kind (HTTP_SYNC_RUN) is added with attempts: 1 (no automatic retry)', async () => {
    const { enqueueOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await enqueueOwnedJob({ type: 'HTTP_SYNC_RUN', shopId: 's1', payload: {} });
    expect(addMock).toHaveBeenCalledWith(
      'HTTP_SYNC_RUN',
      { jobId: 'job_q1' },
      expect.objectContaining({ jobId: 'job_q1', attempts: 1 }),
    );
  });

  it('FLOW_RUN and CONNECTOR_TEST also get attempts: 1', async () => {
    const { enqueueOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await enqueueOwnedJob({ type: 'FLOW_RUN', shopId: 's1', payload: {} });
    await enqueueOwnedJob({ type: 'CONNECTOR_TEST', shopId: 's1', payload: {} });
    expect(addMock).toHaveBeenNthCalledWith(1, 'FLOW_RUN', expect.anything(), expect.objectContaining({ attempts: 1 }));
    expect(addMock).toHaveBeenNthCalledWith(2, 'CONNECTOR_TEST', expect.anything(), expect.objectContaining({ attempts: 1 }));
  });

  it('MESSAGING_RUN and RESTOCK_WATCH_RUN get attempts: 3', async () => {
    const { enqueueOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await enqueueOwnedJob({ type: 'MESSAGING_RUN', shopId: 's1', payload: {} });
    await enqueueOwnedJob({ type: 'RESTOCK_WATCH_RUN', shopId: 's1', payload: {} });
    expect(addMock).toHaveBeenNthCalledWith(1, 'MESSAGING_RUN', expect.anything(), expect.objectContaining({ attempts: 3 }));
    expect(addMock).toHaveBeenNthCalledWith(2, 'RESTOCK_WATCH_RUN', expect.anything(), expect.objectContaining({ attempts: 3 }));
  });
});

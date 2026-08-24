import { describe, expect, it, vi } from 'vitest';

// bullmq Worker is mocked: capture (queueName, processor, opts) and let the test
// invoke the processor directly with a fake bull job.
const workerCtor = vi.fn();
vi.mock('bullmq', () => ({
  Worker: class {
    opts: unknown;
    processor: (job: unknown) => Promise<unknown>;
    constructor(queueName: string, processor: (job: unknown) => Promise<unknown>, opts: unknown) {
      workerCtor(queueName, opts);
      this.processor = processor;
      this.opts = opts;
    }
    close = vi.fn(async () => {});
  },
}));
vi.mock('ioredis', () => ({ default: class { quit = vi.fn(async () => {}); } }));

import { createWebWorkerRuntime } from '~/services/jobs/worker-runtime.server';
import { enqueueWebJob, isAsyncJobsEnabled } from '~/services/jobs/enqueue.server';

describe('createWebWorkerRuntime', () => {
  it('mounts one Worker per registered queue and rebuilds the envelope from payload.trace', async () => {
    process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';
    const seen: unknown[] = [];
    const runtime = createWebWorkerRuntime({
      handlers: {
        'ai-generation': async (envelope) => {
          seen.push(envelope);
          return { status: 'SUCCESS', result: { ok: true } };
        },
      },
    });
    expect(runtime.workers).toHaveLength(1);
    expect(workerCtor).toHaveBeenCalledWith('ai-generation', expect.objectContaining({ prefix: 'superapp' }));

    const w = runtime.workers[0] as unknown as { processor: (j: unknown) => Promise<unknown> };
    await w.processor({
      id: 'job_1',
      name: 'AI_GENERATE',
      data: { prompt: 'x', trace: { correlationId: 'corr_abc', shopId: 'shop_1' } },
    });
    expect(seen[0]).toMatchObject({
      id: 'job_1',
      queueName: 'ai-generation',
      jobType: 'AI_GENERATE',
      trace: { correlationId: 'corr_abc', shopId: 'shop_1' },
    });
    await runtime.close();
  });

  it('a FAILED handler result throws so BullMQ counts the attempt', async () => {
    process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';
    const runtime = createWebWorkerRuntime({
      handlers: { publish: async () => ({ status: 'FAILED', result: { error: { message: 'boom' } } }) },
    });
    const w = runtime.workers[0] as unknown as { processor: (j: unknown) => Promise<unknown> };
    await expect(
      w.processor({ id: 'job_2', name: 'PUBLISH', data: { trace: { correlationId: 'c' } } }),
    ).rejects.toThrow(/boom/);
    await runtime.close();
  });

  // WS-C commit-0 fold-in (b): processors need to tell a mid-retry failure
  // apart from a terminal one — BullMQ's `job.attemptsMade` reflects attempts
  // BEFORE this one (0 on the very first attempt; incremented only once an
  // attempt finishes), so `isFinalAttempt` is `attemptsMade + 1 >= attemptsTotal`,
  // mirroring BullMQ's own `Job#shouldRetryJob` check.
  it('threads attemptsMade/attemptsTotal/isFinalAttempt from the BullMQ job onto the envelope', async () => {
    process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';
    const seen: unknown[] = [];
    const runtime = createWebWorkerRuntime({
      handlers: {
        'ai-generation': async (envelope) => {
          seen.push(envelope);
          return { status: 'SUCCESS' };
        },
      },
    });
    const w = runtime.workers[0] as unknown as { processor: (j: unknown) => Promise<unknown> };

    // First attempt of a 2-attempt job: not final.
    await w.processor({
      id: 'job_1',
      name: 'AI_GENERATE',
      attemptsMade: 0,
      opts: { attempts: 2 },
      data: { trace: { correlationId: 'c' } },
    });
    expect(seen[0]).toMatchObject({ attemptsMade: 0, attemptsTotal: 2, isFinalAttempt: false });

    // Second (last) attempt of the same 2-attempt job: final.
    await w.processor({
      id: 'job_2',
      name: 'AI_GENERATE',
      attemptsMade: 1,
      opts: { attempts: 2 },
      data: { trace: { correlationId: 'c' } },
    });
    expect(seen[1]).toMatchObject({ attemptsMade: 1, attemptsTotal: 2, isFinalAttempt: true });

    await runtime.close();
  });

  it('treats missing attempts info as final — fail-safe, never silently stuck non-terminal', async () => {
    process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';
    const seen: unknown[] = [];
    const runtime = createWebWorkerRuntime({
      handlers: {
        'ai-generation': async (envelope) => {
          seen.push(envelope);
          return { status: 'SUCCESS' };
        },
      },
    });
    const w = runtime.workers[0] as unknown as { processor: (j: unknown) => Promise<unknown> };
    await w.processor({ id: 'job_3', name: 'AI_GENERATE', data: { trace: { correlationId: 'c' } } });
    expect(seen[0]).toMatchObject({ attemptsMade: 0, attemptsTotal: undefined, isFinalAttempt: true });
    await runtime.close();
  });
});

describe('enqueueWebJob', () => {
  it('embeds the trace in the payload (the BullMQ adapter only transmits payload)', async () => {
    const add = vi.fn(async (_payload: Record<string, unknown>) => ({}));
    const adapter = {
      enqueue: vi.fn(async (input: { payload: Record<string, unknown> }) => {
        add(input.payload);
        return { queueName: 'ai-generation' as const, jobId: 'job_1' };
      }),
      close: vi.fn(),
    };
    const res = await enqueueWebJob(
      { id: 'job_1', jobType: 'AI_GENERATE', payload: { prompt: 'x' }, trace: { correlationId: 'corr_abc' } },
      { adapter },
    );
    expect(res.jobId).toBe('job_1');
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'x', trace: { correlationId: 'corr_abc' } }));
  });
});

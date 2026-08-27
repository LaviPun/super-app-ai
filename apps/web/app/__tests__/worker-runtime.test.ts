import { describe, expect, it, vi } from 'vitest';

// bullmq Worker is mocked: capture (queueName, processor, opts) and let the test
// invoke the processor directly with a fake bull job.
const workerCtor = vi.fn();
vi.mock('bullmq', () => ({
  Worker: class {
    opts: unknown;
    processor: (job: unknown) => Promise<unknown>;
    // WS-C final review (IMPORTANT-2a): captures `.on(event, cb)` registrations
    // so tests can invoke the 'failed' handler directly, the same way `processor`
    // is invoked directly above.
    listeners: Record<string, (...args: unknown[]) => void> = {};
    constructor(queueName: string, processor: (job: unknown) => Promise<unknown>, opts: unknown) {
      workerCtor(queueName, opts);
      this.processor = processor;
      this.opts = opts;
    }
    on(event: string, cb: (...args: unknown[]) => void) {
      this.listeners[event] = cb;
      return this;
    }
    close = vi.fn(async () => {});
  },
}));
vi.mock('ioredis', () => ({ default: class { quit = vi.fn(async () => {}); } }));

import { createWebWorkerRuntime, isTerminalWorkerFailure } from '~/services/jobs/worker-runtime.server';
import { enqueueWebJob } from '~/services/jobs/enqueue.server';

type MockWorker = {
  processor: (j: unknown) => Promise<unknown>;
  listeners: Record<string, (...args: unknown[]) => void>;
};

/** Waits for the fire-and-forget `void reconcileFailedJobRow(...).catch(...)` chain to settle. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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

// WS-C final review (IMPORTANT-2a). A worker hard-crash (SIGKILL/OOM) or a
// stall BullMQ gave up on never runs the normal processor code path (which
// would otherwise call jobs.fail/failWithPayload) — the Prisma Job row is
// left RUNNING forever unless the `'failed'` event handler reconciles it.
describe('createWebWorkerRuntime — "failed" event reconciliation', () => {
  function makeRuntime(jobReconciler: { failIfStillRunning: ReturnType<typeof vi.fn> }) {
    process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';
    return createWebWorkerRuntime({
      handlers: { 'ai-generation': async () => ({ status: 'SUCCESS' }) },
      jobReconciler,
    });
  }

  it('reconciles a RUNNING row to FAILED when the failure is the FINAL attempt', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.workers[0] as unknown as MockWorker;

    w.listeners['failed']?.(
      { id: 'job_crashed', attemptsMade: 2, opts: { attempts: 2 } },
      new Error('worker process exited unexpectedly'),
    );
    await flushMicrotasks();

    expect(failIfStillRunning).toHaveBeenCalledTimes(1);
    expect(failIfStillRunning).toHaveBeenCalledWith(
      'job_crashed',
      expect.objectContaining({
        error: 'INTERNAL_ERROR',
        message: expect.stringContaining('crashed or was terminated'),
        requestId: 'job_crashed',
      }),
    );
    await runtime.close();
  });

  it('does NOT reconcile a non-final attempt failure — BullMQ still has a retry coming', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.workers[0] as unknown as MockWorker;

    w.listeners['failed']?.({ id: 'job_retry', attemptsMade: 0, opts: { attempts: 2 } }, new Error('transient'));
    await flushMicrotasks();

    expect(failIfStillRunning).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('treats a stalled-beyond-maxStalledCount give-up as terminal even with attempts remaining', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.workers[0] as unknown as MockWorker;

    // attemptsMade (0) < attemptsTotal (5) — would read as non-final by
    // attempts-count alone, but BullMQ's own stalled give-up message must
    // still win.
    w.listeners['failed']?.(
      { id: 'job_stalled', attemptsMade: 0, opts: { attempts: 5 } },
      new Error('job stalled more than allowable limit'),
    );
    await flushMicrotasks();

    expect(failIfStillRunning).toHaveBeenCalledWith(
      'job_stalled',
      expect.objectContaining({ message: expect.stringContaining('stalled') }),
    );
    await runtime.close();
  });

  it('treats missing attemptsTotal as terminal (fail-safe)', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.workers[0] as unknown as MockWorker;

    w.listeners['failed']?.({ id: 'job_unknown_attempts', attemptsMade: 0 }, new Error('boom'));
    await flushMicrotasks();

    expect(failIfStillRunning).toHaveBeenCalledWith('job_unknown_attempts', expect.anything());
    await runtime.close();
  });

  it('a missing bullJob (BullMQ: removeOnFail deleted it) never throws and never calls the reconciler', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.workers[0] as unknown as MockWorker;

    expect(() => w.listeners['failed']?.(undefined, new Error('stalled, job deleted'))).not.toThrow();
    await flushMicrotasks();

    expect(failIfStillRunning).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('a reconciler rejection (e.g. DB blip) never crashes the worker process', async () => {
    const failIfStillRunning = vi.fn(async () => {
      throw new Error('db unavailable');
    });
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.workers[0] as unknown as MockWorker;

    expect(() =>
      w.listeners['failed']?.({ id: 'job_x', attemptsMade: 1, opts: { attempts: 1 } }, new Error('crash')),
    ).not.toThrow();
    await flushMicrotasks();

    expect(failIfStillRunning).toHaveBeenCalledTimes(1);
    await runtime.close();
  });

  it('is a no-op (does not error) when the row was already terminal — failIfStillRunning returns false', async () => {
    const failIfStillRunning = vi.fn(async () => false);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.workers[0] as unknown as MockWorker;

    expect(() =>
      w.listeners['failed']?.({ id: 'job_already_done', attemptsMade: 1, opts: { attempts: 1 } }, new Error('crash')),
    ).not.toThrow();
    await flushMicrotasks();

    expect(failIfStillRunning).toHaveBeenCalledTimes(1);
    await runtime.close();
  });
});

describe('isTerminalWorkerFailure', () => {
  it('is terminal once attemptsMade reaches attemptsTotal', () => {
    expect(isTerminalWorkerFailure(1, 2, 'boom')).toBe(false);
    expect(isTerminalWorkerFailure(2, 2, 'boom')).toBe(true);
  });

  it('is terminal for a stalled give-up regardless of attempts remaining', () => {
    expect(isTerminalWorkerFailure(0, 5, 'job stalled more than allowable limit')).toBe(true);
  });

  it('is terminal (fail-safe) when attemptsTotal is unknown', () => {
    expect(isTerminalWorkerFailure(0, undefined, 'boom')).toBe(true);
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

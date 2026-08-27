import { describe, expect, it, vi } from 'vitest';

/**
 * Fix round (Important #3): the ops worker ("superapp-ops" queue,
 * ops-queue.server.ts) had no BullMQ `'failed'`-event reconciler — a worker
 * hard-crash (SIGKILL/OOM) or a stall BullMQ gives up on never runs
 * processOwnedJob's own `jobs.fail` path, so without one a Job row is left
 * RUNNING forever. `createOpsWorkerRuntime` mirrors WS-C's
 * `createWebWorkerRuntime` (worker-runtime.test.ts) exactly — same mocking
 * pattern, same scenarios — reusing WS-C's own `isTerminalWorkerFailure`
 * directly rather than reimplementing it.
 */

const workerCtor = vi.fn();
vi.mock('bullmq', () => ({
  Worker: class {
    opts: unknown;
    processor: (job: unknown) => Promise<unknown>;
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
  Queue: class {
    add = vi.fn(async () => ({}));
    close = vi.fn(async () => {});
  },
}));

vi.mock('@superapp/job-orchestration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@superapp/job-orchestration')>();
  return {
    ...actual,
    createRedisConnection: () => ({ quit: vi.fn(async () => {}) }),
  };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({ job: { findUnique: vi.fn(async () => null) } }),
}));

// Reimplemented rather than the real module (which transitively pulls in
// ~/shopify.server et al via MessagingRunnerService/FlowRunnerService — a
// heavy chain unrelated to what these 'failed'-event tests exercise).
vi.mock('~/services/jobs/job-executors.server', () => ({
  JOB_EXECUTORS: {},
  isOwnedJobType: () => false,
}));

import { createOpsWorkerRuntime } from '~/services/jobs/ops-queue.server';

type MockWorker = {
  processor: (j: unknown) => Promise<unknown>;
  listeners: Record<string, (...args: unknown[]) => void>;
};

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeRuntime(jobReconciler: { failIfStillRunning: ReturnType<typeof vi.fn> }) {
  process.env.QUEUE_REDIS_URL = 'redis://localhost:6379';
  return createOpsWorkerRuntime({ jobReconciler });
}

describe('createOpsWorkerRuntime — mounts the "superapp-ops" Worker', () => {
  it('mounts one Worker on the "superapp-ops" queue', async () => {
    const runtime = makeRuntime({ failIfStillRunning: vi.fn(async () => true) });
    expect(workerCtor).toHaveBeenCalledWith('superapp-ops', expect.objectContaining({ prefix: 'superapp' }));
    await runtime.close();
  });
});

describe('createOpsWorkerRuntime — "failed" event reconciliation (mirrors WS-C exactly)', () => {
  it('reconciles a RUNNING row to FAILED when the failure is the FINAL attempt', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.worker as unknown as MockWorker;

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

  it('does NOT reconcile a non-final attempt failure — BullMQ still has a retry coming (the deliberate rethrow in processOwnedJob)', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.worker as unknown as MockWorker;

    w.listeners['failed']?.({ id: 'job_retry', attemptsMade: 0, opts: { attempts: 3 } }, new Error('transient boom'));
    await flushMicrotasks();

    expect(failIfStillRunning).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('treats a stalled-beyond-maxStalledCount give-up as terminal even with attempts remaining', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.worker as unknown as MockWorker;

    w.listeners['failed']?.(
      { id: 'job_stalled', attemptsMade: 0, opts: { attempts: 5 } },
      new Error('job stalled more than allowable limit'),
    );
    await flushMicrotasks();

    expect(failIfStillRunning).toHaveBeenCalledWith('job_stalled', expect.objectContaining({ message: expect.stringContaining('stalled') }));
    await runtime.close();
  });

  it('treats missing attemptsTotal as terminal (fail-safe)', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.worker as unknown as MockWorker;

    w.listeners['failed']?.({ id: 'job_unknown_attempts', attemptsMade: 0 }, new Error('boom'));
    await flushMicrotasks();

    expect(failIfStillRunning).toHaveBeenCalledWith('job_unknown_attempts', expect.anything());
    await runtime.close();
  });

  it('a missing bullJob (BullMQ: removeOnFail deleted it) never throws and never calls the reconciler', async () => {
    const failIfStillRunning = vi.fn(async () => true);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.worker as unknown as MockWorker;

    expect(() => w.listeners['failed']?.(undefined, new Error('stalled, job deleted'))).not.toThrow();
    await flushMicrotasks();

    expect(failIfStillRunning).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('idempotent: failIfStillRunning returning false (row already terminal) is a legitimate no-op, no throw', async () => {
    const failIfStillRunning = vi.fn(async () => false);
    const runtime = makeRuntime({ failIfStillRunning });
    const w = runtime.worker as unknown as MockWorker;

    expect(() =>
      w.listeners['failed']?.({ id: 'job_race', attemptsMade: 2, opts: { attempts: 2 } }, new Error('boom')),
    ).not.toThrow();
    await flushMicrotasks();

    expect(failIfStillRunning).toHaveBeenCalledTimes(1);
    await runtime.close();
  });
});

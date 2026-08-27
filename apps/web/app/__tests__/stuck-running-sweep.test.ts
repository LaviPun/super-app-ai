import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WS-G Task 17: stuck-RUNNING sweep + max-attempts policy. Complementary
 * belt-and-suspenders to WS-C's BullMQ 'failed'-event reconciler
 * (worker-runtime.server.ts's reconcileFailedJobRow, which uses
 * `JobService.failIfStillRunning` for its own atomic single-writer
 * discipline) — that reconciler only fires when BullMQ actually emits a
 * 'failed' event; this sweep is a cron-driven fallback for rows the event
 * path missed entirely (e.g. a worker SIGKILL before any event fires, or
 * Redis data loss). It uses the plain `JobService.fail` (unconditional
 * write, this app's original job-bookkeeping API — distinct from WS-C's
 * `failIfStillRunning`/`failWithPayload`, added for the platform worker
 * runtime) since the sweep's own `WHERE status: 'RUNNING'` query is already
 * the race-safety boundary here.
 */

const { jobFindManyMock, failMock, enqueueMock, fireMock } = vi.hoisted(() => ({
  jobFindManyMock: vi.fn(),
  failMock: vi.fn(async () => ({})),
  enqueueMock: vi.fn(async () => ({ jobId: 'job_new', queued: true })),
  fireMock: vi.fn(async () => ({ sentry: true, email: false, slack: false })),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    job: { findMany: jobFindManyMock },
  }),
}));

vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    fail = failMock;
  },
}));

vi.mock('~/services/jobs/ops-queue.server', () => ({
  enqueueOwnedJob: enqueueMock,
}));

// Reimplemented rather than the real module (which transitively pulls in
// ~/shopify.server et al via MessagingRunnerService/FlowRunnerService — a
// heavy chain unrelated to what this sweep needs to test).
const OWNED = new Set(['CONNECTOR_TEST', 'FLOW_RUN', 'MESSAGING_RUN', 'HTTP_SYNC_RUN', 'RESTOCK_WATCH_RUN', 'LOYALTY_ACCRUAL_RUN']);
vi.mock('~/services/jobs/job-executors.server', () => ({
  isOwnedJobType: (type: string) => OWNED.has(type),
}));

vi.mock('~/services/observability/ops-alert.server', () => ({
  OpsAlertService: class {
    fire = fireMock;
  },
}));

describe('sweepStuckRunningJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    failMock.mockResolvedValue({});
    enqueueMock.mockResolvedValue({ jobId: 'job_new', queued: true });
    fireMock.mockResolvedValue({ sentry: true, email: false, slack: false });
  });

  it('re-enqueues a stuck owned-type job under maxAttempts', async () => {
    jobFindManyMock.mockResolvedValue([
      {
        id: 'job_1',
        type: 'CONNECTOR_TEST',
        status: 'RUNNING',
        startedAt: new Date(Date.now() - 20 * 60_000),
        attempts: 1,
        maxAttempts: 3,
        payload: null,
        shopId: 's1',
        correlationId: 'corr_1',
      },
    ]);

    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs({ staleAfterMs: 10 * 60_000 });

    expect(result.swept).toBe(1);
    expect(result.failedPermanently).toBe(0);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR_TEST', shopId: 's1' }),
    );
    expect(failMock).toHaveBeenCalledWith('job_1', expect.stringMatching(/stuck/i));
  });

  it('permanently FAILs a stuck job once attempts >= maxAttempts, firing an ops alert', async () => {
    jobFindManyMock.mockResolvedValue([
      {
        id: 'job_2',
        type: 'CONNECTOR_TEST',
        status: 'RUNNING',
        startedAt: new Date(Date.now() - 20 * 60_000),
        attempts: 3,
        maxAttempts: 3,
        payload: null,
        shopId: 's1',
        correlationId: null,
      },
    ]);

    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs();

    expect(result.failedPermanently).toBe(1);
    expect(result.swept).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('job_2', expect.stringMatching(/stuck/i));
    expect(fireMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'STUCK_JOB_SWEPT' }));
  });

  it('an unowned-type stuck job (e.g. AI_GENERATE) is FAILed, never re-enqueued', async () => {
    jobFindManyMock.mockResolvedValue([
      {
        id: 'job_3',
        type: 'AI_GENERATE',
        status: 'RUNNING',
        startedAt: new Date(Date.now() - 20 * 60_000),
        attempts: 1,
        maxAttempts: 3,
        payload: null,
        shopId: 's1',
        correlationId: null,
      },
    ]);

    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs();

    expect(result.failedPermanently).toBe(1);
    expect(result.swept).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('job_3', expect.stringMatching(/not safely replayable/i));
  });
});

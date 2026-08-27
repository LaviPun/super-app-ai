import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WS-G Task 17: stuck-RUNNING sweep + max-attempts policy. Complementary
 * belt-and-suspenders to WS-C's BullMQ 'failed'-event reconciler
 * (worker-runtime.server.ts's reconcileFailedJobRow, which uses
 * `JobService.failIfStillRunning` for its own atomic single-writer
 * discipline) — that reconciler only fires when BullMQ actually emits a
 * 'failed' event; this sweep is a cron-driven fallback for rows the event
 * path missed entirely (e.g. a worker SIGKILL before any event fires, or
 * Redis data loss).
 *
 * Fix round (Critical #2, controller ruling): the sweep's SELECT and its
 * terminal write are NOT atomic against each other — this file now proves
 * the terminal write goes through the SAME atomic `failIfStillRunning` CAS
 * WS-C's reconciler uses, and that a CAS loss (the job legitimately finished
 * between select and sweep) is a silent no-op: no re-enqueue, no ops alert.
 * Re-enqueue eligibility is also now gated on the real job-retry-policy.ts
 * (isAutoRetried), not just `attempts < maxAttempts` — CONNECTOR_TEST is an
 * OWNED type but NOT auto-retried (no verified idempotency guard), so a
 * stuck CONNECTOR_TEST row must be FAILed, never re-enqueued.
 */

const { jobFindManyMock, failIfStillRunningMock, enqueueMock, fireMock } = vi.hoisted(() => ({
  jobFindManyMock: vi.fn(),
  failIfStillRunningMock: vi.fn(async () => true),
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
    failIfStillRunning = failIfStillRunningMock;
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

// The real job-retry-policy.ts is pure (no side effects) — used unmocked so
// this test exercises the actual, current idempotency policy rather than a
// hand-maintained duplicate that could drift from it.

vi.mock('~/services/observability/ops-alert.server', () => ({
  OpsAlertService: class {
    fire = fireMock;
  },
}));

vi.mock('~/services/observability/logger.server', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function stuckJob(overrides: Partial<{ id: string; type: string; attempts: number; maxAttempts: number; shopId: string; correlationId: string | null; payload: string | null }>) {
  return {
    id: 'job_x',
    type: 'CONNECTOR_TEST',
    status: 'RUNNING',
    startedAt: new Date(Date.now() - 20 * 60_000),
    attempts: 1,
    maxAttempts: 3,
    payload: null,
    shopId: 's1',
    correlationId: 'corr_1',
    ...overrides,
  };
}

describe('sweepStuckRunningJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    failIfStillRunningMock.mockResolvedValue(true);
    enqueueMock.mockResolvedValue({ jobId: 'job_new', queued: true });
    fireMock.mockResolvedValue({ sentry: true, email: false, slack: false });
  });

  it('re-enqueues a stuck IDEMPOTENT owned-type job (MESSAGING_RUN) under maxAttempts', async () => {
    jobFindManyMock.mockResolvedValue([stuckJob({ id: 'job_1', type: 'MESSAGING_RUN', attempts: 1, maxAttempts: 3 })]);

    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs({ staleAfterMs: 10 * 60_000 });

    expect(result.swept).toBe(1);
    expect(result.failedPermanently).toBe(0);
    // The CAS must be claimed BEFORE the replacement is enqueued.
    expect(failIfStillRunningMock).toHaveBeenCalledWith('job_1', expect.objectContaining({ message: expect.stringMatching(/stuck/i) }));
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'MESSAGING_RUN', shopId: 's1' }));
  });

  it('permanently FAILs a stuck IDEMPOTENT job once attempts >= maxAttempts, firing an ops alert', async () => {
    jobFindManyMock.mockResolvedValue([stuckJob({ id: 'job_2', type: 'MESSAGING_RUN', attempts: 3, maxAttempts: 3 })]);

    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs();

    expect(result.failedPermanently).toBe(1);
    expect(result.swept).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(failIfStillRunningMock).toHaveBeenCalledWith('job_2', expect.objectContaining({ message: expect.stringMatching(/max attempts exhausted/i) }));
    expect(fireMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'STUCK_JOB_SWEPT' }));
  });

  it('a stuck NON-idempotent owned-type job (CONNECTOR_TEST — attempts:1, no verified guard) is FAILed, never re-enqueued even under its own maxAttempts', async () => {
    // maxAttempts:3 simulates a legacy pre-fix-round row (Job.maxAttempts
    // wasn't synced to the retry policy before Critical #1) — the sweep must
    // still refuse to retry it because job-retry-policy.ts says CONNECTOR_TEST
    // isn't auto-retried, regardless of what the stale DB counter says.
    jobFindManyMock.mockResolvedValue([stuckJob({ id: 'job_3', type: 'CONNECTOR_TEST', attempts: 1, maxAttempts: 3 })]);

    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs();

    expect(result.failedPermanently).toBe(1);
    expect(result.swept).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(failIfStillRunningMock).toHaveBeenCalledWith(
      'job_3',
      expect.objectContaining({ message: expect.stringMatching(/not auto-retried/i) }),
    );
  });

  it('an unowned-type stuck job (e.g. AI_GENERATE) is FAILed, never re-enqueued', async () => {
    jobFindManyMock.mockResolvedValue([stuckJob({ id: 'job_4', type: 'AI_GENERATE', attempts: 1, maxAttempts: 3 })]);

    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs();

    expect(result.failedPermanently).toBe(1);
    expect(result.swept).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(failIfStillRunningMock).toHaveBeenCalledWith(
      'job_4',
      expect.objectContaining({ message: expect.stringMatching(/not safely replayable/i) }),
    );
  });

  it('Critical #2 — a CAS loss (the job resolved between select and sweep) is a silent no-op: no re-enqueue, no alert, no count', async () => {
    jobFindManyMock.mockResolvedValue([stuckJob({ id: 'job_5', type: 'MESSAGING_RUN', attempts: 1, maxAttempts: 3 })]);
    // The row is no longer RUNNING by the time the sweep tries to claim it
    // (it finished on its own, e.g. a slow-but-successful executor) — the
    // atomic WHERE status:'RUNNING' guard inside failIfStillRunning loses.
    failIfStillRunningMock.mockResolvedValue(false);

    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs();

    expect(result.swept).toBe(0);
    expect(result.failedPermanently).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(fireMock).not.toHaveBeenCalled();
  });

  it('Critical #2 — a CAS loss on the permanent-fail path (non-idempotent type) is also a silent no-op', async () => {
    jobFindManyMock.mockResolvedValue([stuckJob({ id: 'job_6', type: 'CONNECTOR_TEST', attempts: 1, maxAttempts: 3 })]);
    failIfStillRunningMock.mockResolvedValue(false);

    const { sweepStuckRunningJobs } = await import('~/services/jobs/stuck-job-sweep.server');
    const result = await sweepStuckRunningJobs();

    expect(result.swept).toBe(0);
    expect(result.failedPermanently).toBe(0);
    expect(fireMock).not.toHaveBeenCalled();
  });
});

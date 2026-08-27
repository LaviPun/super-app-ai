import { describe, expect, it, vi, beforeEach } from 'vitest';

const succeedMock = vi.fn(async () => ({}));
const failMock = vi.fn(async () => ({}));
const startMock = vi.fn(async () => ({}));
const createMock = vi.fn(async (params: { type: string; maxAttempts?: number }) => ({
  id: 'job_1',
  type: params.type,
  payload: null,
  shopId: 's1',
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    succeed = succeedMock;
    fail = failMock;
    start = startMock;
    create = createMock;
  },
}));
vi.mock('~/services/jobs/job-executors.server', () => ({
  JOB_EXECUTORS: { CONNECTOR_TEST: vi.fn(async () => ({ ok: true })) },
  isOwnedJobType: (t: string) => t === 'CONNECTOR_TEST' || t === 'MESSAGING_RUN',
}));
vi.mock('~/services/observability/logger.server', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('~/services/observability/redact.server', () => ({
  safeErrorMeta: (err: unknown) => ({ error: String(err) }),
}));

beforeEach(() => vi.clearAllMocks());

describe('processOwnedJob (worker processor)', () => {
  it('calls the matching executor and marks the job SUCCESS', async () => {
    const { processOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await processOwnedJob({ id: 'job_1', type: 'CONNECTOR_TEST', payload: '{"a":1}', shopId: 's1' } as never);
    expect(succeedMock).toHaveBeenCalledWith('job_1', { ok: true });
  });

  it('marks the job FAILED (via JobService.fail, which fires the ops alert) when the executor throws with no attempt info (always final)', async () => {
    const { JOB_EXECUTORS } = await import('~/services/jobs/job-executors.server');
    (JOB_EXECUTORS as Record<string, unknown>).CONNECTOR_TEST = vi.fn(async () => {
      throw new Error('conn refused');
    });
    const { processOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await processOwnedJob({ id: 'job_1', type: 'CONNECTOR_TEST', payload: '{}', shopId: 's1' } as never);
    expect(failMock).toHaveBeenCalledWith('job_1', expect.any(Error));
  });

  it('fix round (Critical #1/Minor #6): a NON-final attempt failure rethrows and does NOT call jobs.fail (no alert, no terminal write)', async () => {
    const { JOB_EXECUTORS } = await import('~/services/jobs/job-executors.server');
    (JOB_EXECUTORS as Record<string, unknown>).CONNECTOR_TEST = vi.fn(async () => {
      throw new Error('transient boom');
    });
    const { processOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await expect(
      processOwnedJob(
        { id: 'job_1', type: 'CONNECTOR_TEST', payload: '{}', shopId: 's1' } as never,
        { attemptsMade: 0, attemptsTotal: 3 },
      ),
    ).rejects.toThrow('transient boom');
    expect(failMock).not.toHaveBeenCalled();
  });

  it('a FINAL attempt (attemptsMade + 1 >= attemptsTotal) failure calls jobs.fail and does not rethrow', async () => {
    const { JOB_EXECUTORS } = await import('~/services/jobs/job-executors.server');
    (JOB_EXECUTORS as Record<string, unknown>).CONNECTOR_TEST = vi.fn(async () => {
      throw new Error('final boom');
    });
    const { processOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await expect(
      processOwnedJob(
        { id: 'job_1', type: 'CONNECTOR_TEST', payload: '{}', shopId: 's1' } as never,
        { attemptsMade: 2, attemptsTotal: 3 },
      ),
    ).resolves.toBeUndefined();
    expect(failMock).toHaveBeenCalledWith('job_1', expect.any(Error));
  });

  it('unknown attemptsTotal reads as final (fail-safe) — never leaves a row stuck non-terminal', async () => {
    const { isFinalOwnedJobAttempt } = await import('~/services/jobs/ops-queue.server');
    expect(isFinalOwnedJobAttempt({ attemptsMade: 0, attemptsTotal: undefined })).toBe(true);
    expect(isFinalOwnedJobAttempt(undefined)).toBe(true);
    expect(isFinalOwnedJobAttempt({ attemptsMade: 0, attemptsTotal: 3 })).toBe(false);
    expect(isFinalOwnedJobAttempt({ attemptsMade: 2, attemptsTotal: 3 })).toBe(true);
  });
});

describe('enqueueOwnedJob per-kind retry attempts (fix round, Critical #1)', () => {
  it('creates the Job row with maxAttempts matching the retry policy for an idempotent kind (MESSAGING_RUN, 3)', async () => {
    const { enqueueOwnedJob } = await import('~/services/jobs/ops-queue.server');
    // JOB_EXECUTION_MODE unset in this test env → inline fallback (mode !== 'queue'),
    // so this only exercises the Job.create({ maxAttempts }) call, not the real
    // BullMQ .add() opts — that's covered by job-retry-policy.test.ts's pure
    // JOB_RETRY_ATTEMPTS assertions plus ops-worker's attemptInfo tests above.
    await enqueueOwnedJob({ type: 'MESSAGING_RUN', shopId: 's1', payload: {} });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'MESSAGING_RUN', maxAttempts: 3 }));
  });

  it('creates the Job row with maxAttempts: 1 for a non-idempotent kind (CONNECTOR_TEST)', async () => {
    const { enqueueOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await enqueueOwnedJob({ type: 'CONNECTOR_TEST', shopId: 's1', payload: {} });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'CONNECTOR_TEST', maxAttempts: 1 }));
  });
});

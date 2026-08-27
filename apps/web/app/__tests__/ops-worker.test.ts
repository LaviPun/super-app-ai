import { describe, expect, it, vi, beforeEach } from 'vitest';

const succeedMock = vi.fn(async () => ({}));
const failMock = vi.fn(async () => ({}));
const startMock = vi.fn(async () => ({}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    succeed = succeedMock;
    fail = failMock;
    start = startMock;
  },
}));
vi.mock('~/services/jobs/job-executors.server', () => ({
  JOB_EXECUTORS: { CONNECTOR_TEST: vi.fn(async () => ({ ok: true })) },
  isOwnedJobType: (t: string) => t === 'CONNECTOR_TEST',
}));

beforeEach(() => vi.clearAllMocks());

describe('processOwnedJob (worker processor)', () => {
  it('calls the matching executor and marks the job SUCCESS', async () => {
    const { processOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await processOwnedJob({ id: 'job_1', type: 'CONNECTOR_TEST', payload: '{"a":1}', shopId: 's1' } as never);
    expect(succeedMock).toHaveBeenCalledWith('job_1', { ok: true });
  });

  it('marks the job FAILED (via JobService.fail, which fires the ops alert) when the executor throws', async () => {
    const { JOB_EXECUTORS } = await import('~/services/jobs/job-executors.server');
    (JOB_EXECUTORS as Record<string, unknown>).CONNECTOR_TEST = vi.fn(async () => {
      throw new Error('conn refused');
    });
    const { processOwnedJob } = await import('~/services/jobs/ops-queue.server');
    await processOwnedJob({ id: 'job_1', type: 'CONNECTOR_TEST', payload: '{}', shopId: 's1' } as never);
    expect(failMock).toHaveBeenCalledWith('job_1', expect.any(Error));
  });
});

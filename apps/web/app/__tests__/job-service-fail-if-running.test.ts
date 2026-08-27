/**
 * WS-C final review (IMPORTANT-2a). `JobService.failIfStillRunning` is the
 * atomic, race-safe write the worker-runtime `'failed'`-event reconciler
 * uses (see worker-runtime.test.ts for the reconciliation-decision tests) —
 * this file covers the write itself: the `status: 'RUNNING'` guard belongs
 * in the WHERE clause (not a separate read-then-write), and the payload
 * shape matches `failWithPayload`'s (same terminal-write format, just a
 * conditional variant).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  updateMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({ job: { updateMany: hoisted.updateMany } }),
}));

describe('JobService.failIfStillRunning', () => {
  beforeEach(() => {
    hoisted.updateMany.mockClear();
  });

  it('atomically guards the update on status: RUNNING inside the WHERE clause', async () => {
    const { JobService } = await import('~/services/jobs/job.service');
    await new JobService().failIfStillRunning('job_1', {
      error: 'INTERNAL_ERROR',
      message: 'crashed',
      requestId: 'job_1',
    });

    expect(hoisted.updateMany).toHaveBeenCalledWith({
      where: { id: 'job_1', status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: expect.any(Date),
        error: JSON.stringify({ error: 'INTERNAL_ERROR', message: 'crashed', requestId: 'job_1' }),
      },
    });
  });

  it('returns true when it actually flipped a RUNNING row', async () => {
    hoisted.updateMany.mockResolvedValueOnce({ count: 1 });
    const { JobService } = await import('~/services/jobs/job.service');
    const flipped = await new JobService().failIfStillRunning('job_1', {
      error: 'INTERNAL_ERROR',
      message: 'crashed',
      requestId: 'job_1',
    });
    expect(flipped).toBe(true);
  });

  it('returns false (no-op, not an error) when the row was already terminal', async () => {
    hoisted.updateMany.mockResolvedValueOnce({ count: 0 });
    const { JobService } = await import('~/services/jobs/job.service');
    const flipped = await new JobService().failIfStillRunning('job_already_done', {
      error: 'INTERNAL_ERROR',
      message: 'crashed',
      requestId: 'job_already_done',
    });
    expect(flipped).toBe(false);
  });
});

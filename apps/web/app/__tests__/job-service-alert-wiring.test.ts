import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('~/db.server', () => ({ getPrisma: () => ({ job: { update: vi.fn(async (args: any) => ({ id: args.where.id, ...args.data })) } }) }));
const fireMock = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
// Fix round 2: reimplement markOpsAlerted with the real module's `__opsAlerted`
// convention (mirrors webhook-fanout-alert-wiring.test.ts's "fix round 1"
// pattern) so the double-alert-seam assertion below can observe the mark.
vi.mock('~/services/observability/ops-alert.server', () => ({
  OpsAlertService: class {
    fire = fireMock;
  },
  markOpsAlerted: (error: unknown) => {
    if (error && typeof error === 'object') (error as { __opsAlerted?: boolean }).__opsAlerted = true;
  },
  wasOpsAlerted: (error: unknown) =>
    !!(error && typeof error === 'object' && (error as { __opsAlerted?: boolean }).__opsAlerted === true),
}));
import { JobService } from '~/services/jobs/job.service';
import { wasOpsAlerted } from '~/services/observability/ops-alert.server';

beforeEach(() => vi.clearAllMocks());

describe('JobService.fail → OpsAlertService', () => {
  it('fires a JOB_FAILED alert with the job id and error in context/message', async () => {
    await new JobService().fail('job_1', new Error('publish blew up'));
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'JOB_FAILED', context: expect.objectContaining({ jobId: 'job_1' }) }),
    );
  });

  it('marks the error as ops-alerted after firing (double-alert seam, fix round 2)', async () => {
    const err = new Error('publish blew up again');
    await new JobService().fail('job_1', err);
    expect(wasOpsAlerted(err)).toBe(true);
  });
});

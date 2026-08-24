import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('~/db.server', () => ({ getPrisma: () => ({ job: { update: vi.fn(async (args: any) => ({ id: args.where.id, ...args.data })) } }) }));
const fireMock = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
vi.mock('~/services/observability/ops-alert.server', () => ({ OpsAlertService: class { fire = fireMock; } }));
import { JobService } from '~/services/jobs/job.service';

beforeEach(() => vi.clearAllMocks());

describe('JobService.fail → OpsAlertService', () => {
  it('fires a JOB_FAILED alert with the job id and error in context/message', async () => {
    await new JobService().fail('job_1', new Error('publish blew up'));
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'JOB_FAILED', context: expect.objectContaining({ jobId: 'job_1' }) }),
    );
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `runCronTick()` is the sweep body shared by the worker's in-process
 * scheduler and the /api/cron HTTP trigger. This pins the two things the
 * scheduler relies on: every tick calls the ops-health sweep (which writes the
 * `AppSettings.cronLastTickAt` heartbeat that /healthz/deep measures), and a
 * failing sweep never fails the tick (D8: logged, not swallowed, not fatal).
 */

const claimDueMock = vi.fn();
const runForTriggerMock = vi.fn();
const messagingRunForTriggerMock = vi.fn();
const httpSyncRunForTriggerMock = vi.fn();
const replayDueDeadLettersMock = vi.fn();
const resumeDueWorkflowRunsMock = vi.fn();
const planSyncSweepMock = vi.fn();
const drainCleanupMock = vi.fn();
const stuckSweepMock = vi.fn();
const opsHealthSweepMock = vi.fn();
const auditRetentionMock = vi.fn();
const chatRetentionMock = vi.fn();
const loyaltyExpiryMock = vi.fn();

vi.mock('~/services/flows/schedule.service', () => ({
  ScheduleService: class {
    claimDue = claimDueMock;
  },
}));
vi.mock('~/services/flows/flow-runner.service', () => ({
  FlowRunnerService: class {
    runForTrigger = runForTriggerMock;
  },
}));
vi.mock('~/services/messaging/messaging-runner.service', () => ({
  MessagingRunnerService: class {
    runForTrigger = messagingRunForTriggerMock;
  },
}));
vi.mock('~/services/integration/http-sync-runner.service', () => ({
  HttpSyncRunnerService: class {
    runForTrigger = httpSyncRunForTriggerMock;
    replayDueDeadLetters = replayDueDeadLettersMock;
  },
}));
vi.mock('~/services/workflows/workflow-engine.service', () => ({
  WorkflowEngineService: class {
    resumeDueWorkflowRuns = resumeDueWorkflowRunsMock;
  },
}));
vi.mock('~/services/billing/plan-sync.service', () => ({
  PlanSyncService: class {
    sweep = planSyncSweepMock;
  },
}));
vi.mock('~/services/flows/auth-resolver.server', () => ({
  buildShopAuthResolver: () => async () => ({ type: 'none' }),
}));
vi.mock('~/services/jobs/internal-ai-audit-retention.job', () => ({
  runInternalAiAuditRetention: auditRetentionMock,
}));
vi.mock('~/services/jobs/internal-ai-chat-retention.job', () => ({
  runInternalAiChatRetention: chatRetentionMock,
}));
vi.mock('~/services/jobs/loyalty-expiry.job', () => ({
  runLoyaltyExpirySweep: loyaltyExpiryMock,
}));
vi.mock('~/services/jobs/shopify-metaobject-cleanup.job', () => ({
  drainShopifyMetaobjectCleanupJobs: drainCleanupMock,
}));
vi.mock('~/services/jobs/stuck-job-sweep.server', () => ({
  sweepStuckRunningJobs: stuckSweepMock,
}));
vi.mock('~/services/observability/ops-health.server', () => ({
  runOpsHealthSweep: opsHealthSweepMock,
}));

describe('runCronTick', () => {
  let runCronTick: typeof import('~/services/jobs/cron-tick.server').runCronTick;

  beforeAll(async () => {
    ({ runCronTick } = await import('~/services/jobs/cron-tick.server'));
  }, 60_000);

  beforeEach(() => {
    vi.clearAllMocks();
    claimDueMock.mockResolvedValue([
      { id: 'sched_1', shopDomain: 'a.myshopify.com', eventJson: '{"topic":"nightly"}' },
    ]);
    runForTriggerMock.mockResolvedValue(undefined);
    messagingRunForTriggerMock.mockResolvedValue(undefined);
    httpSyncRunForTriggerMock.mockResolvedValue(undefined);
    replayDueDeadLettersMock.mockResolvedValue([]);
    resumeDueWorkflowRunsMock.mockResolvedValue([]);
    planSyncSweepMock.mockResolvedValue({ synced: 0, failed: 0 });
    drainCleanupMock.mockResolvedValue({ processed: 0, succeeded: 0, failed: 0, jobs: [] });
    stuckSweepMock.mockResolvedValue({ swept: 0, failedPermanently: 0 });
    opsHealthSweepMock.mockResolvedValue({ status: 'ok', alertsFired: [] });
    auditRetentionMock.mockResolvedValue({ deleted: 0, retentionDays: 90, cutoff: '2026-01-01T00:00:00.000Z' });
    chatRetentionMock.mockResolvedValue({ deleted: 0, retentionDays: 30, cutoff: '2026-01-01T00:00:00.000Z' });
    loyaltyExpiryMock.mockResolvedValue({ shopsSwept: 0, rowsExpired: 0, pointsExpired: 0, ranAt: '2026-01-01T00:00:00.000Z' });
  });

  it('fires due schedules and runs the ops-health sweep (the heartbeat writer) every tick', async () => {
    const result = await runCronTick();

    expect(runForTriggerMock).toHaveBeenCalledWith(
      'a.myshopify.com',
      null,
      'SCHEDULED',
      expect.objectContaining({ kind: 'schedule', scheduleId: 'sched_1', topic: 'nightly' }),
    );
    expect(opsHealthSweepMock).toHaveBeenCalledTimes(1);
    expect(stuckSweepMock).toHaveBeenCalledTimes(1);
    expect(replayDueDeadLettersMock).toHaveBeenCalledWith(20);
    expect(result.ran).toBe(1);
    expect(result.results).toEqual([{ scheduleId: 'sched_1', shopDomain: 'a.myshopify.com', ok: true }]);
    expect(result.opsHealthSweep).toEqual({ status: 'ok', alertsFired: [] });
    expect(result.stuckJobSweep).toEqual({ swept: 0, failedPermanently: 0 });
  });

  it('keeps ticking when the ops-health sweep throws — the failure is reported in the result, not thrown', async () => {
    opsHealthSweepMock.mockRejectedValueOnce(new Error('settings table locked'));

    const result = await runCronTick();

    expect(result.opsHealthSweep).toBeNull();
    expect(result.ran).toBe(1);
  });

  it('records a schedule failure per item without aborting the rest of the tick', async () => {
    runForTriggerMock.mockRejectedValueOnce(new Error('flow blew up'));

    const result = await runCronTick();

    expect(result.results[0]).toMatchObject({ scheduleId: 'sched_1', ok: false, error: expect.stringContaining('flow blew up') });
    expect(opsHealthSweepMock).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WS-G Task 15: internal.ops.tsx's `job_replay`/`job_replay_all` intents must
 * actually re-execute owned job kinds (Decision G8) via enqueueOwnedJob,
 * instead of only creating a fresh QUEUED Job row nothing ever consumed. For
 * a JobType this app's worker doesn't own (AI_GENERATE/AI_HYDRATE/AI_MODIFY/
 * PUBLISH), refuse honestly rather than fake success.
 */

const { requireInternalAdminMock, jobFindUniqueMock, jobFindManyMock, enqueueOwnedJobMock, activityLogMock } =
  vi.hoisted(() => ({
    requireInternalAdminMock: vi.fn(async () => ({})),
    jobFindUniqueMock: vi.fn(),
    jobFindManyMock: vi.fn(async (): Promise<unknown[]> => []),
    enqueueOwnedJobMock: vi.fn(async () => ({ jobId: 'job_new', queued: true })),
    activityLogMock: vi.fn(async () => ({})),
  }));

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    job: { findUnique: jobFindUniqueMock, findMany: jobFindManyMock },
  }),
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = activityLogMock;
  },
}));

vi.mock('~/services/jobs/ops-queue.server', () => ({
  enqueueOwnedJob: enqueueOwnedJobMock,
}));

vi.mock('~/services/observability/correlation.server', () => ({
  generateCorrelationId: () => 'corr_replay_1',
}));

// internal.ops.tsx imports a wide surface of services for its other intents
// (publish/rollback/flow/connector) — stub them minimally so the module loads.
vi.mock('~/services/modules/module.service', () => ({ ModuleService: class {} }));
vi.mock('~/services/publish/rollback.service', () => ({ RollbackService: class {} }));
vi.mock('~/services/publish/publish.service', () => ({ PublishService: class {} }));
vi.mock('~/services/recipes/recipe.service', () => ({ RecipeService: class { parse = vi.fn(); } }));
vi.mock('~/shopify.server', () => ({ unauthenticated: { admin: vi.fn() } }));
vi.mock('~/services/flows/schedule.service', () => ({ ScheduleService: class {} }));
vi.mock('~/services/flows/flow-runner.service', () => ({ FlowRunnerService: class {} }));
vi.mock('~/services/connectors/connector.service', () => ({
  ConnectorService: class {},
  parseConnectorAuth: vi.fn(),
}));

function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return { request: { formData: async () => form } } as never;
}

describe('internal.ops.tsx job_replay (WS-G Task 15, Decision G8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueOwnedJobMock.mockResolvedValue({ jobId: 'job_new', queued: true });
    activityLogMock.mockResolvedValue({});
  });

  it('job_replay for an owned type (CONNECTOR_TEST) actually re-runs it via enqueueOwnedJob', async () => {
    jobFindUniqueMock.mockResolvedValue({
      id: 'job_1',
      type: 'CONNECTOR_TEST',
      shopId: 'shop_1',
      payload: JSON.stringify({ connectorId: 'c1' }),
      correlationId: 'corr_orig',
    });

    const { action } = await import('~/routes/internal.ops');
    const res = await action(formRequest({ intent: 'job_replay', id: 'job_1' }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(enqueueOwnedJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR_TEST', shopId: 'shop_1' }),
    );
  });

  it('job_replay for an unowned type (AI_GENERATE) refuses honestly instead of faking success', async () => {
    jobFindUniqueMock.mockResolvedValue({
      id: 'job_2',
      type: 'AI_GENERATE',
      shopId: 'shop_1',
      payload: null,
      correlationId: null,
    });

    const { action } = await import('~/routes/internal.ops');
    const res = await action(formRequest({ intent: 'job_replay', id: 'job_2' }));
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/not yet replayable/i);
    expect(enqueueOwnedJobMock).not.toHaveBeenCalled();
  });

  it('job_replay_all replays owned-type failures and reports the skipped-unowned count', async () => {
    jobFindManyMock.mockResolvedValue([
      { id: 'job_a', type: 'CONNECTOR_TEST', shopId: 's1', payload: null, correlationId: null },
      { id: 'job_b', type: 'AI_GENERATE', shopId: 's1', payload: null, correlationId: null },
      { id: 'job_c', type: 'FLOW_RUN', shopId: 's1', payload: null, correlationId: null },
    ]);

    const { action } = await import('~/routes/internal.ops');
    const res = await action(formRequest({ intent: 'job_replay_all' }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(enqueueOwnedJobMock).toHaveBeenCalledTimes(2);
    expect(body.message).toMatch(/2/);
    expect(body.message).toMatch(/1 skipped/i);
  });
});

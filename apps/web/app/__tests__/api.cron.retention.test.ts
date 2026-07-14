import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '~/services/errors/app-error.server';

const claimDueMock = vi.fn();
const runForTriggerMock = vi.fn();
const messagingRunForTriggerMock = vi.fn();
const resumeDueWorkflowRunsMock = vi.fn();
const runInternalAiAuditRetentionMock = vi.fn();
const runInternalAiChatRetentionMock = vi.fn();
const enforceRateLimitMock = vi.fn();

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

// R3.5: the resume sweep runs every tick; mock the engine + resolver so the cron
// loader never touches a real DB.
vi.mock('~/services/workflows/workflow-engine.service', () => ({
  WorkflowEngineService: class {
    resumeDueWorkflowRuns = resumeDueWorkflowRunsMock;
  },
}));

vi.mock('~/services/flows/auth-resolver.server', () => ({
  buildShopAuthResolver: () => async () => ({ type: 'none' }),
}));

vi.mock('~/services/jobs/internal-ai-audit-retention.job', () => ({
  runInternalAiAuditRetention: runInternalAiAuditRetentionMock,
}));

vi.mock('~/services/jobs/internal-ai-chat-retention.job', () => ({
  runInternalAiChatRetention: runInternalAiChatRetentionMock,
}));

vi.mock('~/services/security/rate-limit.server', () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

describe('/api/cron retention loader', () => {
  let loader: typeof import('~/routes/api.cron').loader;

  // Import the route once, up front, rather than inside every test. api.cron
  // transitively pulls in Prisma + every cron service, so cold-importing that
  // module graph can take several seconds under full-suite parallel CPU
  // contention. Doing it per-test meant the FIRST test paid that cold-import cost
  // inside the default 5s testTimeout and intermittently timed out under load
  // (passing in isolation / on reruns once the module was warm). Amortizing it to
  // a single beforeAll with generous headroom removes the flake at the source.
  beforeAll(async () => {
    ({ loader } = await import('~/routes/api.cron'));
  }, 60_000);

  beforeEach(() => {
    vi.clearAllMocks();
    claimDueMock.mockResolvedValue([]);
    messagingRunForTriggerMock.mockResolvedValue(undefined);
    resumeDueWorkflowRunsMock.mockResolvedValue([]);
    runInternalAiAuditRetentionMock.mockResolvedValue({
      deleted: 4,
      retentionDays: 90,
      cutoff: '2026-01-01T00:00:00.000Z',
    });
    runInternalAiChatRetentionMock.mockResolvedValue({
      deleted: 2,
      retentionDays: 30,
      cutoff: '2026-01-01T00:00:00.000Z',
    });
    enforceRateLimitMock.mockResolvedValue(undefined);
    // Isolate CRON_SECRET via vi.stubEnv rather than mutating process.env
    // directly. Prisma's runtime env-loading repopulates CRON_SECRET from .env
    // into process.env, and vitest's fork pool shares one process.env across
    // files in a worker while isolating module registries — so a raw
    // delete/assignment both races that repopulation and leaks into sibling test
    // files. stubEnv owns a single value that unstubAllEnvs (afterEach) restores,
    // and the loader reads the var at call time, so import order is irrelevant.
    vi.stubEnv('CRON_SECRET', 'expected-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 when CRON_SECRET is missing', async () => {
    // An empty CRON_SECRET is treated as "not configured" by the loader
    // (`if (!secret)`), exactly like an unset var — the endpoint is disabled.
    vi.stubEnv('CRON_SECRET', '');
    const res = await loader({ request: new Request('http://test/api/cron') });
    expect(res.status).toBe(503);
  });

  it('returns 401 when X-Cron-Secret does not match', async () => {
    const res = await loader({
      request: new Request('http://test/api/cron', {
        headers: { 'x-cron-secret': 'wrong-secret' },
      }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 429 when request is rate limited', async () => {
    enforceRateLimitMock.mockRejectedValueOnce(
      new AppError({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        details: { retryAfterSec: '11' },
      }),
    );
    const res = await loader({
      request: new Request('http://test/api/cron', {
        headers: { 'x-cron-secret': 'expected-secret' },
      }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('11');
  });

  it('runs internal retention jobs with a valid cron secret', async () => {
    const res = await loader({
      request: new Request('http://test/api/cron', {
        headers: { 'x-cron-secret': 'expected-secret' },
      }),
    });
    expect(res.status).toBe(200);
    expect(runInternalAiAuditRetentionMock).toHaveBeenCalledTimes(1);
    expect(runInternalAiChatRetentionMock).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as {
      auditRetention: { deleted: number };
      chatRetention: { deleted: number };
    };
    expect(body.auditRetention.deleted).toBe(4);
    expect(body.chatRetention.deleted).toBe(2);
  });

  it('runs the durable resume sweep and returns it in the response (R3.5)', async () => {
    resumeDueWorkflowRunsMock.mockResolvedValueOnce([
      { runId: 'flowpark_1', tenantId: 'shop_1', status: 'SUCCEEDED' },
    ]);
    const res = await loader({
      request: new Request('http://test/api/cron', {
        headers: { 'x-cron-secret': 'expected-secret' },
      }),
    });
    expect(res.status).toBe(200);
    expect(resumeDueWorkflowRunsMock).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { resumeSweep: Array<{ runId: string; status: string }> };
    expect(body.resumeSweep).toEqual([{ runId: 'flowpark_1', tenantId: 'shop_1', status: 'SUCCEEDED' }]);
  });

  it('does not 500 the tick when the resume sweep throws (R3.5)', async () => {
    resumeDueWorkflowRunsMock.mockRejectedValueOnce(new Error('db down'));
    const res = await loader({
      request: new Request('http://test/api/cron', {
        headers: { 'x-cron-secret': 'expected-secret' },
      }),
    });
    expect(res.status).toBe(200); // sweep failure caught, tick still succeeds
    const body = (await res.json()) as { resumeSweep: unknown[] };
    expect(body.resumeSweep).toEqual([]); // stays empty on failure
  });
});

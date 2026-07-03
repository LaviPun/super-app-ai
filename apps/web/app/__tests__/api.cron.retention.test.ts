import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '~/services/errors/app-error.server';

const claimDueMock = vi.fn();
const runForTriggerMock = vi.fn();
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
  beforeEach(() => {
    vi.clearAllMocks();
    claimDueMock.mockResolvedValue([]);
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
  });

  it('returns 503 when CRON_SECRET is missing', async () => {
    // Import first: api.cron transitively loads the db layer which runs
    // dotenv.config() (repopulating .env's CRON_SECRET). Delete AFTER that so
    // the loader — which reads the env var at call time — sees it unset.
    const mod = await import('~/routes/api.cron');
    delete process.env.CRON_SECRET;
    const res = await mod.loader({ request: new Request('http://test/api/cron') });
    expect(res.status).toBe(503);
  });

  it('returns 401 when X-Cron-Secret does not match', async () => {
    process.env.CRON_SECRET = 'expected-secret';
    const mod = await import('~/routes/api.cron');
    const res = await mod.loader({
      request: new Request('http://test/api/cron', {
        headers: { 'x-cron-secret': 'wrong-secret' },
      }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 429 when request is rate limited', async () => {
    process.env.CRON_SECRET = 'expected-secret';
    enforceRateLimitMock.mockRejectedValueOnce(
      new AppError({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        details: { retryAfterSec: '11' },
      }),
    );
    const mod = await import('~/routes/api.cron');
    const res = await mod.loader({
      request: new Request('http://test/api/cron', {
        headers: { 'x-cron-secret': 'expected-secret' },
      }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('11');
  });

  it('runs internal retention jobs with a valid cron secret', async () => {
    process.env.CRON_SECRET = 'expected-secret';
    const mod = await import('~/routes/api.cron');
    const res = await mod.loader({
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
});

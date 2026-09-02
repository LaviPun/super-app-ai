import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /healthz/deep route (DevOps hardening 2026-09): auth contract + status-code
 * mapping. The signal math itself is covered by ops-health.test.ts — here the
 * collector is mocked so the route contract is what's under test.
 */
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    // db probe: SELECT 1 succeeds
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
  }),
}));

const collectMock = vi.fn();
vi.mock('~/services/observability/ops-health.server', () => ({
  collectOpsHealth: (...args: unknown[]) => collectMock(...args),
}));

vi.mock('~/internal-admin/session.server', () => ({
  internalSessionStorage: {
    getSession: vi.fn(async (cookie: string | null) => ({
      get: (key: string) => (cookie === 'admin-cookie' && key === 'internal_admin' ? true : undefined),
    })),
  },
}));

import { loader } from '~/routes/healthz_.deep';

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/healthz/deep', { headers });
}

const OK_SNAPSHOT = {
  status: 'ok' as const,
  checkedAt: new Date().toISOString(),
  signals: [{ name: 'dlqDepth', status: 'ok' as const, value: 0, detail: '' }],
};

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
  delete process.env.REDIS_URL; // redis probe: skipped in these tests
  collectMock.mockResolvedValue(OK_SNAPSHOT);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.clearAllMocks();
});

describe('/healthz/deep auth', () => {
  it('401s without a secret or session', async () => {
    const res = await loader({ request: request(), params: {}, context: {} } as never);
    expect(res.status).toBe(401);
  });

  it('401s with a wrong secret', async () => {
    const res = await loader({ request: request({ 'x-cron-secret': 'nope' }), params: {}, context: {} } as never);
    expect(res.status).toBe(401);
  });

  it('503s (disabled) when CRON_SECRET is unset and no session', async () => {
    delete process.env.CRON_SECRET;
    const res = await loader({ request: request(), params: {}, context: {} } as never);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain('CRON_SECRET');
  });

  it('200s with the correct secret', async () => {
    const res = await loader(
      { request: request({ 'x-cron-secret': 'test-cron-secret' }), params: {}, context: {} } as never,
    );
    expect(res.status).toBe(200);
  });

  it('200s with an internal admin session cookie', async () => {
    const res = await loader({ request: request({ cookie: 'admin-cookie' }), params: {}, context: {} } as never);
    expect(res.status).toBe(200);
  });
});

describe('/healthz/deep body + status mapping', () => {
  it('returns signals plus the documented lastBackupAge skip', async () => {
    const res = await loader(
      { request: request({ 'x-cron-secret': 'test-cron-secret' }), params: {}, context: {} } as never,
    );
    const body = (await res.json()) as { status: string; infra: { db: string }; signals: Array<{ name: string; status: string }> };
    expect(body.status).toBe('ok');
    expect(body.infra.db).toBe('ok');
    expect(body.signals.map((s) => s.name)).toContain('dlqDepth');
    const backup = body.signals.find((s) => s.name === 'lastBackupAge');
    expect(backup?.status).toBe('skipped');
  });

  it('503s when a signal is failing', async () => {
    collectMock.mockResolvedValue({
      status: 'fail',
      checkedAt: new Date().toISOString(),
      signals: [{ name: 'dlqDepth', status: 'fail', value: 99, detail: '' }],
    });
    const res = await loader(
      { request: request({ 'x-cron-secret': 'test-cron-secret' }), params: {}, context: {} } as never,
    );
    expect(res.status).toBe(503);
  });

  it('200s (not 503) on warn — warn must not flap external monitors', async () => {
    collectMock.mockResolvedValue({
      status: 'warn',
      checkedAt: new Date().toISOString(),
      signals: [{ name: 'dlqDepth', status: 'warn', value: 11, detail: '' }],
    });
    const res = await loader(
      { request: request({ 'x-cron-secret': 'test-cron-secret' }), params: {}, context: {} } as never,
    );
    expect(res.status).toBe(200);
  });
});

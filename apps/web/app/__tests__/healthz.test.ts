import { afterEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ $queryRaw: queryRaw }),
}));

async function loadRoute() {
  vi.resetModules();
  return import('~/routes/healthz');
}

describe('GET /healthz', () => {
  afterEach(() => {
    queryRaw.mockReset();
    delete process.env.REDIS_URL;
  });

  it('returns 200 with db ok and redis skipped when REDIS_URL unset', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const { loader } = await loadRoute();
    const res = await loader();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, checks: { db: 'ok', redis: 'skipped' } });
  });

  it('returns 503 when the database check throws', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const { loader } = await loadRoute();
    const res = await loader();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.checks.db).toBe('fail');
  });
});

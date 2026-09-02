import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ $queryRaw: queryRaw }),
}));

async function loadRoute() {
  vi.resetModules();
  return import('~/routes/healthz');
}

describe('GET /healthz', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The route reads REDIS_URL at module init — clear it up front (not just in
    // afterEach) so a developer shell exporting REDIS_URL doesn't flip the
    // first test's expectation from 'skipped' to a live-redis 'ok'.
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    vi.useRealTimers();
    queryRaw.mockReset();
    delete process.env.REDIS_URL;
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
  });

  it('returns 200 with db ok and redis skipped when REDIS_URL unset', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const { loader } = await loadRoute();
    const res = await loader();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, checks: { db: 'ok', redis: 'skipped' }, release: null });
  });

  it('echoes RAILWAY_GIT_COMMIT_SHA as release for the post-deploy smoke workflow', async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = 'abc123def456';
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const { loader } = await loadRoute();
    const res = await loader();
    const body = await res.json();
    expect(body.release).toBe('abc123def456');
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

  it('returns 503 with db fail when database check never resolves (timeout)', async () => {
    // Mock a promise that never resolves, simulating a hung query
    queryRaw.mockReturnValueOnce(new Promise(() => {}));
    const { loader } = await loadRoute();
    const resultPromise = loader();

    // Fast-forward to trigger the 4000ms timeout
    vi.advanceTimersByTime(4100);

    const res = await resultPromise;
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.checks.db).toBe('fail');
  });
});

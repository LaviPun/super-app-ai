/**
 * WS-C Task 14: internal generation-funnel dashboard loader. Loader-only test
 * (this repo's convention for internal.* routes — see internal-model-setup.route.test.ts)
 * since the vendored page-kit UI is a thin render of the loader payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireInternalAdminMock = vi.fn();
const windowStatsMock = vi.fn();

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/services/observability/funnel.service', () => ({
  FunnelService: class {
    windowStats = windowStatsMock;
  },
}));

const FIXTURE_STATS = {
  windowDays: 7,
  classified: 4,
  optioned: 3,
  hydrated: 2,
  published: 1,
  optionedRate: 0.75,
  hydratedRate: 0.5,
  publishedRate: 0.25,
  endToEndRate: 0.25,
  recentFailures: [
    {
      jobId: 'gen-c',
      type: 'AI_GENERATE',
      correlationId: 'corr-C',
      error: 'Provider hiccup — please retry.',
      createdAt: '2026-08-20T00:00:00.000Z',
      shopDomain: 'failing-shop.myshopify.com',
    },
  ],
};

describe('internal.funnel loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue(undefined);
    windowStatsMock.mockResolvedValue(FIXTURE_STATS);
  });

  it('defaults to a 7-day window and returns { stats, qa: null }', async () => {
    const mod = await import('~/routes/internal.funnel');
    const res = await mod.loader({ request: new Request('http://test/internal/funnel') });
    expect(requireInternalAdminMock).toHaveBeenCalledTimes(1);
    expect(windowStatsMock).toHaveBeenCalledWith(7);

    const body = (await res.json()) as { stats: typeof FIXTURE_STATS; qa: null };
    expect(body.stats).toEqual(FIXTURE_STATS);
    expect(body.qa).toBeNull();
  });

  it('forwards an allowed days query param (30) to FunnelService', async () => {
    const mod = await import('~/routes/internal.funnel');
    await mod.loader({ request: new Request('http://test/internal/funnel?days=30') });
    expect(windowStatsMock).toHaveBeenCalledWith(30);
  });

  it('falls back to the 7-day default for a disallowed days value', async () => {
    const mod = await import('~/routes/internal.funnel');
    await mod.loader({ request: new Request('http://test/internal/funnel?days=365') });
    expect(windowStatsMock).toHaveBeenCalledWith(7);
  });
});

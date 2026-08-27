/**
 * WS-C Task 14: internal generation-funnel dashboard loader. Task 15 adds the
 * QA telemetry section (loader now also calls QaTelemetryService.topIssues)
 * and the promote/demote action. Loader/action-only tests (this repo's
 * convention for internal.* routes — see internal-model-setup.route.test.ts)
 * since the vendored page-kit UI is a thin render of the loader payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireInternalAdminMock = vi.fn();
const windowStatsMock = vi.fn();
const topIssuesMock = vi.fn();
const setPromotedMock = vi.fn();
const activityLogMock = vi.fn();

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/services/observability/funnel.service', () => ({
  FunnelService: class {
    windowStats = windowStatsMock;
  },
}));

vi.mock('~/services/observability/qa-telemetry.service', () => ({
  QaTelemetryService: class {
    topIssues = topIssuesMock;
    setPromoted = setPromotedMock;
  },
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = activityLogMock;
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

const FIXTURE_QA = {
  windowDays: 7,
  totalOptions: 3,
  topIssues: [{ issueId: 'countdown:past-endAt', count: 2, promoted: false }],
};

describe('internal.funnel loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue(undefined);
    windowStatsMock.mockResolvedValue(FIXTURE_STATS);
    topIssuesMock.mockResolvedValue(FIXTURE_QA);
  });

  it('defaults to a 7-day window and returns { stats, qa }', async () => {
    const mod = await import('~/routes/internal.funnel');
    const res = await mod.loader({ request: new Request('http://test/internal/funnel') });
    expect(requireInternalAdminMock).toHaveBeenCalledTimes(1);
    expect(windowStatsMock).toHaveBeenCalledWith(7);
    expect(topIssuesMock).toHaveBeenCalledWith(7);

    const body = (await res.json()) as { stats: typeof FIXTURE_STATS; qa: typeof FIXTURE_QA };
    expect(body.stats).toEqual(FIXTURE_STATS);
    expect(body.qa).toEqual(FIXTURE_QA);
  });

  it('forwards an allowed days query param (30) to FunnelService and QaTelemetryService', async () => {
    const mod = await import('~/routes/internal.funnel');
    await mod.loader({ request: new Request('http://test/internal/funnel?days=30') });
    expect(windowStatsMock).toHaveBeenCalledWith(30);
    expect(topIssuesMock).toHaveBeenCalledWith(30);
  });

  it('falls back to the 7-day default for a disallowed days value', async () => {
    const mod = await import('~/routes/internal.funnel');
    await mod.loader({ request: new Request('http://test/internal/funnel?days=365') });
    expect(windowStatsMock).toHaveBeenCalledWith(7);
    expect(topIssuesMock).toHaveBeenCalledWith(7);
  });
});

describe('internal.funnel action — promote/demote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue(undefined);
    setPromotedMock.mockResolvedValue(['countdown:past-endAt']);
  });

  function postRequest(fields: Record<string, string>): Request {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return new Request('http://test/internal/funnel?days=7', { method: 'POST', body: form });
  }

  it('promotes an issue id, logs the audit action, and redirects back', async () => {
    const mod = await import('~/routes/internal.funnel');
    const res = await mod.action({ request: postRequest({ intent: 'promote', issueId: 'countdown:past-endAt' }) });
    expect(requireInternalAdminMock).toHaveBeenCalledTimes(1);
    expect(setPromotedMock).toHaveBeenCalledWith('countdown:past-endAt', true);
    expect(activityLogMock).toHaveBeenCalledWith({
      actor: 'INTERNAL_ADMIN',
      action: 'QA_ISSUE_PROMOTION',
      resource: 'qa:countdown:past-endAt',
      details: { promoted: true },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/internal/funnel?days=7');
  });

  it('demotes an issue id', async () => {
    const mod = await import('~/routes/internal.funnel');
    await mod.action({ request: postRequest({ intent: 'demote', issueId: 'countdown:past-endAt' }) });
    expect(setPromotedMock).toHaveBeenCalledWith('countdown:past-endAt', false);
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QA_ISSUE_PROMOTION', details: { promoted: false } }),
    );
  });

  it('ignores an unknown intent without mutating state', async () => {
    const mod = await import('~/routes/internal.funnel');
    await mod.action({ request: postRequest({ intent: 'bogus', issueId: 'x' }) });
    expect(setPromotedMock).not.toHaveBeenCalled();
    expect(activityLogMock).not.toHaveBeenCalled();
  });
});

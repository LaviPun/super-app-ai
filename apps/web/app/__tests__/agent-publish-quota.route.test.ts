import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '~/services/errors/app-error.server';

// WS-QF finding: the agent publish route (api.agent.modules.$moduleId.publish.tsx)
// resolved the module and built the deploy target but never called
// QuotaService.enforcePublishCap — unlike the merchant-facing api.publish.tsx,
// so an agent caller could publish past the plan's published-module cap.
// These tests wire a minimal harness around the route (mocking every
// collaborator it touches) and assert the enforcePublishCap gate mirrors
// billing-quota.test.ts's "blocks at cap" / "re-publish excludes itself"
// cases at the route level.

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({
    session: { shop: 'test-shop.myshopify.com' },
    admin: {},
  })),
  getModule: vi.fn(async () => ({
    id: 'mod-1',
    versions: [{ id: 'ver-1', version: 1, status: 'DRAFT', specJson: '{}' }],
  })),
  markPublishedWithTransition: vi.fn(async () => {}),
  // Non-theme type so the route's `themeId is required for theme.* module
  // types` check doesn't fire before we ever reach enforcePublishCap.
  parseSpec: vi.fn(() => ({ type: 'checkout.block', requires: [] })),
  publish: vi.fn(async () => {}),
  getPlanTier: vi.fn(async () => 'FREE'),
  refreshPlanTier: vi.fn(async () => 'FREE'),
  explainCapabilityGate: vi.fn(() => undefined),
  runPublishPreflight: vi.fn(async () => ({
    ok: true,
    missingScopes: [],
    requiredScopes: [],
    grantedScopes: [],
  })),
  evaluatePolicy: vi.fn(() => ({ allowed: true, blocked: [], reasons: [], snapshotKey: 'k' })),
  evaluateFeatureFlag: vi.fn(() => ({ enabled: true, source: 'default', reason: '' })),
  validateBeforePublish: vi.fn(() => []),
  shopFindUnique: vi.fn(async () => ({ id: 'shop-1' })),
  log: vi.fn(async () => {}),
  enforcePublishCap: vi.fn(async () => {}),
  jobCreate: vi.fn(async () => ({ id: 'job-1' })),
  jobStart: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFail: vi.fn(async () => {}),
  startCanary: vi.fn(() => ({ stage: 'canary', decision: 'PROCEED' })),
  evaluateRamp: vi.fn(() => ({ decision: 'CONTINUE' })),
  getRecentPublishMetrics: vi.fn(async () => ({})),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    getModule = hoisted.getModule;
    markPublishedWithTransition = hoisted.markPublishedWithTransition;
  },
}));
vi.mock('~/services/recipes/recipe.service', () => ({
  RecipeService: class {
    parse = hoisted.parseSpec;
  },
}));
vi.mock('~/services/publish/publish.service', () => ({
  PublishService: class {
    publish = hoisted.publish;
  },
}));
vi.mock('~/services/publish/pre-publish-validator.server', () => ({
  validateBeforePublish: hoisted.validateBeforePublish,
}));
vi.mock('~/services/shopify/capability.service', () => ({
  CapabilityService: class {
    getPlanTier = hoisted.getPlanTier;
    refreshPlanTier = hoisted.refreshPlanTier;
    explainCapabilityGate = hoisted.explainCapabilityGate;
  },
}));
vi.mock('~/db.server', () => ({ getPrisma: () => ({ shop: { findUnique: hoisted.shopFindUnique } }) }));
vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));
vi.mock('~/services/billing/quota.service', () => ({
  QuotaService: class {
    enforcePublishCap = hoisted.enforcePublishCap;
  },
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    create = hoisted.jobCreate;
    start = hoisted.jobStart;
    succeed = hoisted.jobSucceed;
    fail = hoisted.jobFail;
  },
}));
vi.mock('~/services/publish/publish-policy.service', () => ({
  PublishPolicyService: class {
    evaluate = hoisted.evaluatePolicy;
  },
}));
vi.mock('~/services/publish/publish-preflight.server', () => ({
  runPublishPreflight: hoisted.runPublishPreflight,
}));
vi.mock('~/services/releases/feature-flags.server', () => ({
  evaluateFeatureFlag: hoisted.evaluateFeatureFlag,
}));
vi.mock('~/services/releases/progressive-publish.server', () => ({
  ProgressivePublishService: class {
    startCanary = hoisted.startCanary;
    evaluateRamp = hoisted.evaluateRamp;
  },
}));
vi.mock('~/services/releases/release-metrics.server', () => ({
  getRecentPublishMetrics: hoisted.getRecentPublishMetrics,
}));

function createRequest() {
  return new Request('https://app.test/api/agent/modules/mod-1/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('api.agent.modules.$moduleId.publish quota', () => {
  it('enforces the publish cap BEFORE creating the publish job, returning structured 429', async () => {
    hoisted.getModule.mockResolvedValue({
      id: 'mod-1',
      versions: [{ id: 'ver-1', version: 1, status: 'DRAFT', specJson: '{}' }],
    });
    hoisted.enforcePublishCap.mockRejectedValueOnce(
      new AppError({ code: 'RATE_LIMITED', message: 'Module limit reached. 3/3.' }),
    );
    const { action } = await import('~/routes/api.agent.modules.$moduleId.publish');
    const res = await action({ request: createRequest(), params: { moduleId: 'mod-1' } });
    expect(res.status).toBe(429);
    const payload = await res.json();
    expect(payload).toMatchObject({ code: 'MODULE_LIMIT_REACHED' });
    expect(hoisted.enforcePublishCap).toHaveBeenCalledWith('shop-1', 'mod-1');
    expect(hoisted.jobCreate).not.toHaveBeenCalled();
    expect(hoisted.publish).not.toHaveBeenCalled();
  });

  it('excludes the module being republished from its own cap (re-publish at cap never blocks)', async () => {
    // enforcePublishCap itself is proven to exclude the target module at the
    // service level (billing-quota.test.ts); here we assert the route wires
    // the moduleId through so a re-publish call is eligible for that
    // exclusion, and that a successful check lets the publish proceed.
    hoisted.enforcePublishCap.mockResolvedValueOnce(undefined);
    const { action } = await import('~/routes/api.agent.modules.$moduleId.publish');
    const res = await action({ request: createRequest(), params: { moduleId: 'mod-1' } });
    expect(hoisted.enforcePublishCap).toHaveBeenCalledWith('shop-1', 'mod-1');
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toMatchObject({ ok: true, moduleId: 'mod-1' });
    expect(hoisted.jobCreate).toHaveBeenCalled();
    expect(hoisted.publish).toHaveBeenCalled();
  });
});

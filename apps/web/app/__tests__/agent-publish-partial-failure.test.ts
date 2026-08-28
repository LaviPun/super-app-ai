import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fix round 1 (WS-E finding 4 review): api.agent.modules.$moduleId.publish.tsx
 * is the route the module-detail page's own Publish/Republish button actually
 * calls (api.publish.tsx is the redirect-based Builder path). Its catch block
 * originally lacked the PublishPartialFailureError special-case api.publish.tsx
 * has, so a partial failure there degraded to a flat `{ error: message }`
 * string instead of the structured `{ code, failedOp, completedOps, guidance }`
 * shape the T14 brief specifies. This mirrors api.publish's own partial-failure
 * test and asserts the SAME shared response shape (via
 * publishPartialFailureResponse in publish-error-response.server.ts) comes back
 * from this route too.
 */

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
  // Non-theme type so the route's theme-target checks don't fire.
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
// Preserve the REAL PublishPartialFailureError export (only PublishService is
// stubbed) — the route does `e instanceof PublishPartialFailureError`, so the
// mock must keep the real class or that check breaks.
vi.mock('~/services/publish/publish.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/services/publish/publish.service')>();
  return {
    ...actual,
    PublishService: class {
      publish = hoisted.publish;
    },
  };
});
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

function createRequest() {
  return new Request('https://app.test/api/agent/modules/mod-1/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('api.agent.modules.$moduleId.publish — PublishPartialFailureError (fix round 1)', () => {
  it('returns the SAME structured 502 shape api.publish.tsx returns: code, failedOp, completedOps, guidance', async () => {
    const { PublishPartialFailureError } = await import('~/services/publish/publish.service');
    hoisted.publish.mockRejectedValueOnce(
      new PublishPartialFailureError(
        'setModuleGidList:superapp_theme/module_refs',
        [
          { op: 'ensureMetafieldDefinition:superapp_theme/module_refs' },
          { op: 'upsertMetaobject:superapp-module-mod-1' },
        ],
        new Error('boom'),
      ),
    );

    const { action } = await import('~/routes/api.agent.modules.$moduleId.publish');
    const res = await action({ request: createRequest(), params: { moduleId: 'mod-1' } });

    expect(res.status).toBe(502);
    const payload = (await res.json()) as {
      error: string;
      code: string;
      failedOp: string;
      completedOps: Array<{ op: string }>;
      guidance: string;
    };
    expect(payload.code).toBe('PUBLISH_PARTIAL_FAILURE');
    expect(payload.failedOp).toBe('setModuleGidList:superapp_theme/module_refs');
    expect(payload.completedOps.map((e) => e.op)).toEqual([
      'ensureMetafieldDefinition:superapp_theme/module_refs',
      'upsertMetaobject:superapp-module-mod-1',
    ]);
    expect(payload.guidance).toMatch(/republish/i);
    expect(payload.error).toMatch(/Republishing is safe/);

    // Failure must never reach the DB flip.
    expect(hoisted.markPublishedWithTransition).not.toHaveBeenCalled();
    expect(hoisted.jobFail).toHaveBeenCalledTimes(1);
  });

  it('a non-partial-failure error still falls through to the flat error shape (unchanged behavior)', async () => {
    hoisted.publish.mockRejectedValueOnce(new Error('some other failure'));

    const { action } = await import('~/routes/api.agent.modules.$moduleId.publish');
    const res = await action({ request: createRequest(), params: { moduleId: 'mod-1' } });

    expect(res.status).toBe(500);
    const payload = await res.json();
    expect(payload).toEqual({ error: 'some other failure' });
  });
});

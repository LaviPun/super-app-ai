import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 's.myshopify.com', locale: 'en' } })),
  enforceRateLimit: vi.fn(async () => {}),
  shopFindFirst: vi.fn(async () => ({ id: 'shop_1', planTier: 'FREE' })),
  getModule: vi.fn(async () => ({
    id: 'mod_1',
    versions: [{ id: 'ver_1', status: 'DRAFT', specJson: JSON.stringify({ type: 'theme.section', name: 'Test module', config: {} }), hydratedAt: null }],
    activeVersion: null,
  })),
  quotaEnforce: vi.fn(async () => {}),
  hydrateRecipeSpec: vi.fn(async () => ({
    adminConfig: { jsonSchema: { type: 'object', properties: {} }, uiSchema: {}, defaults: {} },
    themeEditorSettings: {},
    validationReport: { overall: 'PASS', checks: [] },
  })),
  moduleVersionUpdate: vi.fn(async () => ({})),
  jobCreate: vi.fn(async () => ({ id: 'job_1' })),
  jobStart: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFail: vi.fn(async () => {}),
}));
vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
vi.mock('~/services/security/rate-limit.server', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findFirst: hoisted.shopFindFirst },
    moduleVersion: { update: hoisted.moduleVersionUpdate },
  }),
}));
vi.mock('~/services/billing/quota.service', () => ({ QuotaService: class { enforce = hoisted.quotaEnforce; } }));
vi.mock('~/services/modules/module.service', () => ({ ModuleService: class { getModule = hoisted.getModule; } }));
vi.mock('~/services/ai/llm.server', () => ({
  hydrateRecipeSpec: hoisted.hydrateRecipeSpec,
  AiProviderNotConfiguredError: class extends Error {},
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class { create = hoisted.jobCreate; start = hoisted.jobStart; succeed = hoisted.jobSucceed; fail = hoisted.jobFail; },
}));

function req(body: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  return new Request('https://app.test/api/ai/hydrate-module', { method: 'POST', body: fd });
}

beforeEach(() => vi.clearAllMocks());

describe('api.ai.hydrate-module — "Generate full settings" (WS-F closes [UI-3]: was already wired)', () => {
  it('hydrates, persists adminConfig, and returns ok:true with a validation report', async () => {
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: req({ moduleId: 'mod_1' }) } as never);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.validationReport.overall).toBe('PASS');
    expect(hoisted.moduleVersionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ver_1' },
        data: expect.objectContaining({
          adminConfigSchemaJson: expect.stringContaining('"jsonSchema"'),
        }),
      }),
    );
    expect(hoisted.jobSucceed).toHaveBeenCalled();
  });

  it('returns a structured 503 with a setup link when no AI provider is configured', async () => {
    // Must use the SAME class reference the route imports (the mocked module below),
    // not a locally-shadowed class of the same name — instanceof checks identity,
    // and a look-alike class would silently fall through to the generic 422 branch.
    const { AiProviderNotConfiguredError } = await import('~/services/ai/llm.server');
    hoisted.hydrateRecipeSpec.mockRejectedValueOnce(new AiProviderNotConfiguredError());
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: req({ moduleId: 'mod_1' }) } as never);
    expect(res.status).toBe(503);
    const payload = await res.json();
    expect(payload.setupUrl).toBe('/internal/ai-providers');
    expect(hoisted.jobFail).toHaveBeenCalled();
  });
});

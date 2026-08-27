/**
 * WS-C Task 16 (friendly terminal errors — AppError everywhere on the AI
 * surface). Before this, `api.ai.create-module.tsx`'s catch-all returned
 * `json({ error: e.message }, 500)` — raw internals leaked straight to the
 * merchant — and the hydrate route's generic failure was a bare
 * `{ error: String(e) }`. Every AI route now maps through
 * `toAiRouteAppError` (ai-route-errors.server.ts) so the merchant response
 * and the `Job.error` ledger (`failWithPayload`) always tell the same typed
 * story.
 *
 * Two layers of coverage:
 *  1. `toAiRouteAppError` unit tests — the shared mapping, independent of any
 *     one route's plumbing.
 *  2. Route-level tests for the batch (`api.ai.create-module`) and hydrate
 *     (`api.ai.hydrate-module`) routes' catch blocks, per the task brief.
 *     Both routes (and their many shared dependencies — classify/RAG/theme
 *     pipeline for the batch route, module lookup for the hydrate route) are
 *     mocked from ONE hoisted bag so `~/db.server`/`~/services/ai/llm.server`/
 *     `~/services/jobs/job.service` etc. are each declared exactly once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// 1. toAiRouteAppError — shared mapping (no route mocking needed)
// ---------------------------------------------------------------------------

describe('toAiRouteAppError', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('AiProviderNotConfiguredError -> 503 AI_PROVIDER_NOT_CONFIGURED with details.setupUrl', async () => {
    const { AiProviderNotConfiguredError } = await import('~/services/ai/llm.server');
    const { toAiRouteAppError } = await import('~/services/ai/ai-route-errors.server');
    const appError = toAiRouteAppError(new AiProviderNotConfiguredError(), { setupUrl: '/internal/ai-providers' });
    expect(appError.code).toBe('AI_PROVIDER_NOT_CONFIGURED');
    expect(appError.status).toBe(503);
    expect(appError.details).toEqual({ setupUrl: '/internal/ai-providers' });
  });

  it('a 429-shaped provider error -> 429 RATE_LIMITED with the friendly "not billed" copy', async () => {
    const { toAiRouteAppError } = await import('~/services/ai/ai-route-errors.server');
    const providerError = Object.assign(new Error('rate limited upstream'), { statusCode: 429 });
    const appError = toAiRouteAppError(providerError);
    expect(appError.code).toBe('RATE_LIMITED');
    expect(appError.status).toBe(429);
    expect(appError.message).toBe(
      'AI providers are busy right now. Wait a moment and try again — this attempt was not billed.',
    );
  });

  it('an Error whose message mentions rate_limit (no statusCode) is also treated as rate-limit-shaped', async () => {
    const { toAiRouteAppError } = await import('~/services/ai/ai-route-errors.server');
    const appError = toAiRouteAppError(new Error('upstream 429: rate_limit_exceeded'));
    expect(appError.code).toBe('RATE_LIMITED');
  });

  it('TruncatedOutputError -> 502 OUTPUT_TRUNCATED with retry copy', async () => {
    const { TruncatedOutputError } = await import('~/services/ai/clients/truncation.server');
    const { toAiRouteAppError } = await import('~/services/ai/ai-route-errors.server');
    const appError = toAiRouteAppError(new TruncatedOutputError('anthropic', 'stop_reason=max_tokens'));
    expect(appError.code).toBe('OUTPUT_TRUNCATED');
    expect(appError.status).toBe(502);
    expect(appError.message).toBe('Try again — the model returned an incomplete answer.');
  });

  it('a bare AppError passes through unchanged', async () => {
    const { AppError } = await import('~/services/errors/app-error.server');
    const { toAiRouteAppError } = await import('~/services/ai/ai-route-errors.server');
    const original = new AppError({ code: 'NOT_FOUND', message: 'Module not found' });
    expect(toAiRouteAppError(original)).toBe(original);
  });

  it('generic error in production hides internals -> 500 INTERNAL_ERROR with a requestId', async () => {
    process.env.NODE_ENV = 'production';
    const { toAiRouteAppError } = await import('~/services/ai/ai-route-errors.server');
    const appError = toAiRouteAppError(new Error('ECONNRESET at 10.0.4.2:5432'));
    expect(appError.code).toBe('INTERNAL_ERROR');
    expect(appError.status).toBe(500);
    expect(appError.message).toBe('An unexpected error occurred.');
    expect(appError.requestId).toMatch(/^req_/);
    const payload = appError.toPayload();
    expect(payload).toEqual({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId: appError.requestId });
  });

  it('generic error in development shows the real message', async () => {
    process.env.NODE_ENV = 'development';
    const { toAiRouteAppError } = await import('~/services/ai/ai-route-errors.server');
    const appError = toAiRouteAppError(new Error('ECONNRESET at 10.0.4.2:5432'));
    expect(appError.message).toBe('ECONNRESET at 10.0.4.2:5432');
  });

  it('a route can override the generic fallback code/status (hydrate keeps 422)', async () => {
    process.env.NODE_ENV = 'production';
    const { toAiRouteAppError } = await import('~/services/ai/ai-route-errors.server');
    const appError = toAiRouteAppError(new Error('boom'), { fallbackCode: 'VALIDATION_ERROR', fallbackStatus: 422 });
    expect(appError.code).toBe('VALIDATION_ERROR');
    expect(appError.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// 2. Route-level: api.ai.create-module (batch) + api.ai.hydrate-module.
// One shared mock bag — both routes' dependencies overlap heavily
// (shopify.server, db.server, job.service, llm.server, quota.service).
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' }, admin: {} })),
  enforceRateLimit: vi.fn(async () => {}),
  shopUpsert: vi.fn(async () => ({ id: 'shop-1', planTier: 'BASIC' })),
  shopFindFirst: vi.fn(async () => ({ id: 'shop-1', planTier: 'BASIC' })),
  moduleCount: vi.fn(async () => 0),
  moduleVersionUpdate: vi.fn(async () => ({})),
  quotaEnforce: vi.fn(async () => {}),
  jobCreate: vi.fn(async () => ({ id: 'job-1' })),
  jobStart: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFail: vi.fn(async () => {}),
  jobFailWithPayload: vi.fn(async () => {}),
  generateValidatedRecipeOptions: vi.fn(),
  generateValidatedBlueprint: vi.fn(),
  hydrateRecipeSpec: vi.fn(),
  getModule: vi.fn(),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/security/rate-limit.server', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('~/services/observability/api-log.service', () => ({
  withApiLogging: async (_meta: unknown, fn: () => Promise<Response>) => fn(),
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { upsert: hoisted.shopUpsert, findFirst: hoisted.shopFindFirst },
    module: { count: hoisted.moduleCount },
    moduleVersion: { update: hoisted.moduleVersionUpdate },
  }),
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    create = hoisted.jobCreate;
    start = hoisted.jobStart;
    succeed = hoisted.jobSucceed;
    fail = hoisted.jobFail;
    failWithPayload = hoisted.jobFailWithPayload;
  },
}));
vi.mock('~/services/jobs/enqueue.server', () => ({
  isAsyncJobsEnabled: () => false,
  enqueueWebJob: vi.fn(),
}));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    getModule = hoisted.getModule;
  },
}));
vi.mock('~/services/billing/quota.service', () => ({
  QuotaService: class {
    enforce = hoisted.quotaEnforce;
  },
}));
vi.mock('~/services/shopify/capability.service', () => ({
  CapabilityService: class {
    refreshPlanTier = vi.fn(async () => 'BASIC');
  },
}));
vi.mock('~/services/ai/classify.server', () => ({
  classifyUserIntent: vi.fn(async () => ({ moduleType: 'admin.block' })),
  CONFIDENCE_THRESHOLDS: { DIRECT: 0.8, WITH_ALTERNATIVES: 0.5 },
}));
vi.mock('~/services/ai/cheap-classifier.server', () => ({
  augmentWithCheapClassifier: vi.fn(async (c: unknown) => c),
}));
vi.mock('~/services/ai/intent-packet.server', () => ({
  buildIntentPacket: vi.fn(() => ({
    classification: { intent: 'test', surface: 'ADMIN', confidence: 0.9, alternatives: [], reasons: [] },
    routing: { prompt_profile: 'default' },
  })),
}));
vi.mock('~/services/ai/token-budget.server', () => ({ serializeIntentPacketForPrompt: vi.fn(() => '{}') }));
vi.mock('~/services/ai/prompt-router.server', () => ({ buildPromptRouterDecision: vi.fn(async () => ({})) }));
vi.mock('~/services/ai/requirement-spec.server', () => ({ extractRequirementSpec: vi.fn(async () => ({})) }));
vi.mock('~/services/ai/solution-search.server', () => ({
  searchSolutions: vi.fn(() => ({ startFrom: [], grounding: '', exemplar: null })),
}));
vi.mock('~/services/theme/ensure-aesthetic.server', () => ({ ensureStoreAesthetic: vi.fn(async () => {}) }));
vi.mock('~/services/theme/apply-store-palette.server', () => ({ applyStorePalette: vi.fn() }));
vi.mock('~/services/ai/apply-style-pack.server', () => ({ applyStylePackTokens: vi.fn() }));
vi.mock('~/services/ai/apply-composition.server', () => ({ applyCompositionRules: vi.fn() }));
vi.mock('~/services/ai/design-reference.server', () => ({ loadStoreAesthetic: vi.fn(async () => null) }));
vi.mock('~/services/ai/option-ranking.server', () => ({
  rankOptions: vi.fn(() => ({ recommendedIndex: 0, scores: [] })),
}));
vi.mock('~/services/ai/blueprint-planner', () => ({ planBlueprint: vi.fn(() => ({ kind: 'single' })) }));
vi.mock('~/env.server', () => ({ isBlueprintsEnabled: () => false }));
vi.mock('~/services/ai/llm.server', async () => {
  const actual = await vi.importActual<typeof import('~/services/ai/llm.server')>('~/services/ai/llm.server');
  return {
    ...actual,
    generateValidatedRecipeOptions: hoisted.generateValidatedRecipeOptions,
    generateValidatedBlueprint: hoisted.generateValidatedBlueprint,
    hydrateRecipeSpec: hoisted.hydrateRecipeSpec,
  };
});

function batchRequest(fields?: Record<string, string>): Request {
  const fd = new FormData();
  fd.set('prompt', 'a size guide');
  for (const [k, v] of Object.entries(fields ?? {})) fd.set(k, v);
  return new Request('https://app.test/api/ai/create-module', { method: 'POST', body: fd });
}

describe('api.ai.create-module (batch route) — catch block', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authenticateAdmin.mockResolvedValue({ session: { shop: 'test-shop.myshopify.com' }, admin: {} });
    hoisted.shopUpsert.mockResolvedValue({ id: 'shop-1', planTier: 'BASIC' });
    hoisted.moduleCount.mockResolvedValue(0);
    hoisted.jobCreate.mockResolvedValue({ id: 'job-1' });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('(a) a generic Error in production -> 500 { error: INTERNAL_ERROR, message: "An unexpected error occurred.", requestId: req_... } — no stack/internals, and Job.error carries the SAME payload', async () => {
    process.env.NODE_ENV = 'production';
    hoisted.generateValidatedRecipeOptions.mockRejectedValueOnce(new Error('ECONNRESET at 10.0.4.2:5432'));
    const { action } = await import('~/routes/api.ai.create-module');
    const res = await action({ request: batchRequest() });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId: expect.stringMatching(/^req_/),
    });
    expect(body.message).not.toContain('ECONNRESET');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith('job-1', body);
    expect(hoisted.jobFail).not.toHaveBeenCalled();
  });

  it('(b) a rate-limit-shaped error -> 429 RATE_LIMITED with the friendly copy', async () => {
    const providerError = Object.assign(new Error('rate limited'), { statusCode: 429 });
    hoisted.generateValidatedRecipeOptions.mockRejectedValueOnce(providerError);
    const { action } = await import('~/routes/api.ai.create-module');
    const res = await action({ request: batchRequest() });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('RATE_LIMITED');
    expect(body.message).toMatch(/not billed/);
  });

  it('(c) AiProviderNotConfiguredError -> 503 with details.setupUrl', async () => {
    const { AiProviderNotConfiguredError } = await import('~/services/ai/llm.server');
    hoisted.generateValidatedRecipeOptions.mockRejectedValueOnce(new AiProviderNotConfiguredError());
    const { action } = await import('~/routes/api.ai.create-module');
    const res = await action({ request: batchRequest() });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('AI_PROVIDER_NOT_CONFIGURED');
    expect(body.details).toEqual({ setupUrl: '/internal/ai-providers' });
  });
});

const RECIPE_SPEC_JSON = JSON.stringify({
  type: 'theme.section',
  name: 'Test Section',
  category: 'STOREFRONT_UI',
  requires: [],
  config: {},
});

function hydrateRequest(): Request {
  const fd = new FormData();
  fd.set('moduleId', 'mod-1');
  return new Request('https://app.test/api/ai/hydrate-module', { method: 'POST', body: fd });
}

describe('api.ai.hydrate-module — sync catch block (isAsyncJobsEnabled: false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authenticateAdmin.mockResolvedValue({ session: { shop: 'test-shop.myshopify.com' } } as never);
    hoisted.shopFindFirst.mockResolvedValue({ id: 'shop-1', planTier: 'BASIC' });
    hoisted.jobCreate.mockResolvedValue({ id: 'job-1', correlationId: 'corr-1' } as never);
    hoisted.getModule.mockResolvedValue({
      id: 'mod-1',
      generationCorrelationId: null,
      versions: [{ id: 'ver-1', status: 'DRAFT', hydratedAt: null, specJson: RECIPE_SPEC_JSON, validationReportJson: null }],
      activeVersion: null,
    });
  });

  it('a generic error -> 422 AppError payload (not the legacy bare { error: String(e) })', async () => {
    hoisted.hydrateRecipeSpec.mockRejectedValueOnce(new Error('envelope schema mismatch'));
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: hydrateRequest() });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.requestId).toMatch(/^req_/);
    expect(body).not.toHaveProperty('stack');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith('job-1', body);
  });

  it('AiProviderNotConfiguredError -> 503 with details.setupUrl (same contract as every other AI route)', async () => {
    const { AiProviderNotConfiguredError } = await import('~/services/ai/llm.server');
    hoisted.hydrateRecipeSpec.mockRejectedValueOnce(new AiProviderNotConfiguredError());
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: hydrateRequest() });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('AI_PROVIDER_NOT_CONFIGURED');
    expect(body.details).toEqual({ setupUrl: '/internal/ai-providers' });
  });
});

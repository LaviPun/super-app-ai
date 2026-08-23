/**
 * WS-QF / AI-2: the SSE route must jobs.fail + emit a terminal `error` frame
 * (code NO_VALID_OPTIONS) when a completed stream validated 0 options — and
 * still jobs.succeed on the happy path. Everything heavy is mocked; the real
 * code under test is the route's terminal handling (finalizeGenerationJob wiring).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' }, admin: {} })),
  enforceRateLimit: vi.fn(async () => {}),
  streamEvents: [] as Array<Record<string, unknown>>,
  jobCreate: vi.fn(async () => ({ id: 'job-1' })),
  jobStart: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFail: vi.fn(async () => {}),
  quotaEnforce: vi.fn(async () => {}),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/security/rate-limit.server', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('~/services/ai/llm.server', () => ({
  AiProviderNotConfiguredError: class extends Error {
    code = 'AI_PROVIDER_NOT_CONFIGURED';
  },
  getLlmClient: vi.fn(),
  attributeServedCost: vi.fn(),
  recordAiUsage: vi.fn(),
  generateValidatedBlueprint: vi.fn(),
  generateValidatedRecipeOptionsStream: async function* () {
    for (const ev of hoisted.streamEvents) yield ev;
  },
}));
vi.mock('~/services/ai/option-ranking.server', () => ({
  rankOptions: vi.fn(() => ({ recommendedIndex: 0, scores: [{ index: 0, score: 1, badges: [] }] })),
}));
vi.mock('~/services/observability/ai-usage.service', () => ({ AiUsageService: class {} }));
vi.mock('~/services/ai/judge-polish.server', () => ({
  isJudgePolishEnabled: () => false,
  judgeAndPolishOption: vi.fn(),
  polishIsNotWorse: vi.fn(),
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ shop: { upsert: vi.fn(async () => ({ id: 'shop-1', planTier: 'BASIC' })) } }),
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    create = hoisted.jobCreate;
    start = hoisted.jobStart;
    succeed = hoisted.jobSucceed;
    fail = hoisted.jobFail;
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
  searchSolutions: vi.fn(() => ({ grounding: '', exemplar: null })),
}));
vi.mock('~/services/theme/ensure-aesthetic.server', () => ({ ensureStoreAesthetic: vi.fn(async () => {}) }));
vi.mock('~/services/theme/apply-store-palette.server', () => ({ applyStorePalette: vi.fn() }));
vi.mock('~/services/ai/apply-style-pack.server', () => ({ applyStylePackTokens: vi.fn() }));
vi.mock('~/services/ai/apply-composition.server', () => ({ applyCompositionRules: vi.fn() }));
vi.mock('~/services/ai/design-reference.server', () => ({ loadStoreAesthetic: vi.fn(async () => null) }));
vi.mock('~/services/ai/blueprint-planner', () => ({ planBlueprint: vi.fn(() => ({ kind: 'single' })) }));
vi.mock('~/env.server', () => ({ isBlueprintsEnabled: () => false }));

function streamRequest() {
  const fd = new FormData();
  fd.set('prompt', 'a size guide');
  return new Request('https://app.test/api/ai/create-module/stream', { method: 'POST', body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.streamEvents = [];
});

describe('api.ai.create-module.stream terminal handling', () => {
  it('0 valid options → jobs.fail + terminal error frame NO_VALID_OPTIONS (never succeed)', async () => {
    hoisted.streamEvents = [
      { kind: 'started', index: 0, approach: 'A', total: 3 },
      { kind: 'option_failed', index: 0, approach: 'A', error: 'invalid' },
      { kind: 'done', valid: 0, total: 3 },
    ];
    const { action } = await import('~/routes/api.ai.create-module.stream');
    const res = await action({ request: streamRequest() });
    const body = await res.text();
    expect(body).toContain('event: error');
    expect(body).toContain('NO_VALID_OPTIONS');
    expect(hoisted.jobFail).toHaveBeenCalledTimes(1);
    expect(hoisted.jobSucceed).not.toHaveBeenCalled();
  });

  it('≥1 valid option → jobs.succeed, no error frame', async () => {
    hoisted.streamEvents = [
      { kind: 'started', index: 0, approach: 'A', total: 3 },
      {
        kind: 'option',
        index: 0,
        approach: 'A',
        option: { explanation: 'e', recipe: { type: 'admin.block', name: 'X' } },
      },
      { kind: 'done', valid: 1, total: 3 },
    ];
    const { action } = await import('~/routes/api.ai.create-module.stream');
    const res = await action({ request: streamRequest() });
    const body = await res.text();
    expect(body).toContain('event: option');
    expect(body).not.toContain('event: error');
    expect(hoisted.jobSucceed).toHaveBeenCalledWith('job-1', expect.objectContaining({ optionCount: 1 }));
    expect(hoisted.jobFail).not.toHaveBeenCalled();
  });
});

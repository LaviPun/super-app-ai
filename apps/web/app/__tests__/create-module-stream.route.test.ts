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
  // WS-QF / AI-2 review fix: captures the options object the route passes to
  // generateValidatedRecipeOptionsStream, so we can assert the request's
  // correlationId form field actually reaches the generation call.
  streamCallOptions: [] as Array<Record<string, unknown> | undefined>,
  // Finding 2a (round-2 review): a per-test override generator + pull counter,
  // used to prove the route STOPS consuming (calling .next()) once the client
  // disconnects mid-stream. null = fall back to the static hoisted.streamEvents
  // list used by the other tests.
  customGenerator: null as null | (() => AsyncGenerator<Record<string, unknown>>),
  pullCount: 0,
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
  generateValidatedRecipeOptionsStream: async function* (
    _prompt: string,
    _classification: unknown,
    options?: Record<string, unknown>,
  ) {
    hoisted.streamCallOptions.push(options);
    if (hoisted.customGenerator) {
      for await (const ev of hoisted.customGenerator()) {
        hoisted.pullCount++;
        yield ev;
      }
      return;
    }
    for (const ev of hoisted.streamEvents) {
      hoisted.pullCount++;
      yield ev;
    }
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

function streamRequest(fields?: Record<string, string>, signal?: AbortSignal) {
  const fd = new FormData();
  fd.set('prompt', 'a size guide');
  for (const [k, v] of Object.entries(fields ?? {})) fd.set(k, v);
  return new Request('https://app.test/api/ai/create-module/stream', { method: 'POST', body: fd, signal });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.streamEvents = [];
  hoisted.streamCallOptions = [];
  hoisted.customGenerator = null;
  hoisted.pullCount = 0;
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

  it('WS-QF / AI-2 review fix: the request\'s correlationId form field reaches generateValidatedRecipeOptionsStream', async () => {
    hoisted.streamEvents = [{ kind: 'done', valid: 0, total: 3 }];
    const { action } = await import('~/routes/api.ai.create-module.stream');
    const res = await action({ request: streamRequest({ correlationId: 'attempt-42' }) });
    // WS-C (Task 4): classify/intent/RAG now run inside runGenerationPipeline,
    // called from the stream's start() callback — several awaits deep before
    // generateValidatedRecipeOptionsStream is reached. Draining the body (as
    // the other tests in this file already do) forces that execution to
    // complete before asserting on it, instead of relying on it having
    // already run eagerly by the time action() resolves.
    await res.text();
    expect(hoisted.streamCallOptions).toHaveLength(1);
    expect(hoisted.streamCallOptions[0]).toMatchObject({ correlationId: 'attempt-42' });
  });

  it('an absent correlationId form field is passed through as undefined (no accidental empty-string id)', async () => {
    hoisted.streamEvents = [{ kind: 'done', valid: 0, total: 3 }];
    const { action } = await import('~/routes/api.ai.create-module.stream');
    const res = await action({ request: streamRequest() });
    await res.text();
    expect(hoisted.streamCallOptions).toHaveLength(1);
    expect(hoisted.streamCallOptions[0]?.correlationId).toBeUndefined();
  });

  it('Finding 2a (round-2 review): the route stops consuming the generator once the client disconnects mid-stream', async () => {
    // A 5-item generator that aborts the SAME AbortController backing
    // request.signal partway through — right after producing its 2nd item,
    // before its 3rd item is requested. If the route is correctly watching
    // for the disconnect, it must not pull items 4 and 5 (or process/send
    // item 3, which was already mid-flight when the abort fired) — proving
    // it stopped consuming rather than draining the whole generator
    // regardless of whether anyone is still listening.
    const abortController = new AbortController();
    hoisted.customGenerator = async function* () {
      yield { kind: 'started', index: 0, approach: 'A', total: 5 };
      yield {
        kind: 'option',
        index: 0,
        approach: 'A',
        option: { explanation: 'e0', recipe: { type: 'admin.block', name: 'X0' } },
      };
      // The client goes away right here — after item 2 is already in the
      // client's hands (or lost to the drop), before item 3 is generated.
      abortController.abort();
      yield {
        kind: 'option',
        index: 1,
        approach: 'B',
        option: { explanation: 'e1', recipe: { type: 'admin.block', name: 'X1' } },
      };
      yield {
        kind: 'option',
        index: 2,
        approach: 'C',
        option: { explanation: 'e2', recipe: { type: 'admin.block', name: 'X2' } },
      };
      yield { kind: 'done', valid: 3, total: 5 };
    };

    const { action } = await import('~/routes/api.ai.create-module.stream');
    const res = await action({ request: streamRequest(undefined, abortController.signal) });
    const body = await res.text();

    // The generator has 5 items total; the route must stop pulling once it
    // observes the abort, well short of draining all 5.
    expect(hoisted.pullCount).toBeLessThan(5);
    expect(hoisted.pullCount).toBeGreaterThan(0); // it did process at least the pre-abort events
    // Only the pre-abort option (index 0) should have been sent to the client.
    expect(body).toContain('"index":0');
    expect(body).not.toContain('"index":2');
    expect(body).not.toContain('event: done');
  });

  it('Finding 2a: ReadableStream.cancel() also sets the aborted flag (belt-and-suspenders with the AbortSignal listener)', async () => {
    // Some runtimes surface a client disconnect through the stream's own
    // cancel() callback rather than (or before) the Request AbortSignal. This
    // drives that path directly: read one chunk, then cancel the reader.
    hoisted.customGenerator = async function* () {
      yield { kind: 'started', index: 0, approach: 'A', total: 5 };
      yield {
        kind: 'option',
        index: 0,
        approach: 'A',
        option: { explanation: 'e0', recipe: { type: 'admin.block', name: 'X0' } },
      };
      // Give the reader's cancel() a chance to run before producing more.
      await new Promise((resolve) => setTimeout(resolve, 10));
      yield {
        kind: 'option',
        index: 1,
        approach: 'B',
        option: { explanation: 'e1', recipe: { type: 'admin.block', name: 'X1' } },
      };
      yield { kind: 'done', valid: 2, total: 5 };
    };

    const { action } = await import('~/routes/api.ai.create-module.stream');
    const res = await action({ request: streamRequest() });
    const reader = res.body!.getReader();
    await reader.read(); // pull the first chunk (the unconditional `intent` frame)
    await reader.cancel('client went away');
    // Give the route's background start() a moment to observe the cancellation.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(hoisted.pullCount).toBeLessThan(5);
  });
});

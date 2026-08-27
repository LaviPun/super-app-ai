/**
 * WS-C Task 10 (C7). End-to-end deadline budgets threaded via
 * `GenerateHints.deadlineAt`. Covers:
 *  (a) `ConfiguredLlmClient.callProvider` derives a bounded `timeoutMs` from
 *      `hints.deadlineAt` and forwards it to the provider client.
 *  (b) An already-exhausted deadline throws a typed `PROVIDER_ERROR`
 *      `AppError` WITHOUT ever invoking the provider client.
 *  (c) `hydrateRecipeSpec({ deadlineAt })` forwards it through to the
 *      provider call (mock client captures `timeoutMs`).
 *  (d) `postJsonWithRetries`'s own `deadlineAt` opt: effective timeout is
 *      `min(timeoutMs, deadlineAt - now)` — the shared HTTP layer's half of
 *      the contract, exercised directly (no provider-client indirection).
 *
 * Mocking pattern mirrors `hydrate-billing-dedupe.test.ts`: the REAL
 * `ConfiguredLlmClient`/`hydrateRecipeSpec` run, only their deep
 * collaborators (Prisma, `AiProviderService`, the provider client
 * functions) are mocked.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';

const hoisted = vi.hoisted(() => ({
  providerFindUnique: vi.fn(),
  // `hydrateRecipeSpec` (via `getLlmClient` -> `resolveProviderIdForShop`)
  // resolves the provider through the legacy single-provider path when no
  // shopId/cost-routing/override applies — same "legacy single-provider
  // path" mock as `hydrate-billing-dedupe.test.ts`.
  providerFindFirst: vi.fn(),
  appSettingsFindUnique: vi.fn(),
  getApiKey: vi.fn(),
  anthropicGenerateRecipe: vi.fn(),
  openAiGenerateRecipe: vi.fn(),
  geminiGenerateRecipe: vi.fn(),
  priceFindFirst: vi.fn(),
  usageRecord: vi.fn(async (_args: unknown) => {}),
  hasBilledUnit: vi.fn(async () => false),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiProvider: { findUnique: hoisted.providerFindUnique, findFirst: hoisted.providerFindFirst },
    appSettings: { findUnique: hoisted.appSettingsFindUnique },
    aiModelPrice: { findFirst: hoisted.priceFindFirst },
  }),
}));
vi.mock('~/services/internal/ai-provider.service', () => ({
  AiProviderService: class {
    async getApiKey(id: string) {
      return hoisted.getApiKey(id);
    }
  },
}));
vi.mock('~/services/ai/clients/anthropic-messages.client.server', () => ({
  anthropicGenerateRecipe: (...args: unknown[]) => hoisted.anthropicGenerateRecipe(...args),
}));
vi.mock('~/services/ai/clients/openai-responses.client.server', () => ({
  openAiGenerateRecipe: (...args: unknown[]) => hoisted.openAiGenerateRecipe(...args),
}));
vi.mock('~/services/ai/clients/gemini.client.server', () => ({
  geminiGenerateRecipe: (...args: unknown[]) => hoisted.geminiGenerateRecipe(...args),
}));
vi.mock('~/services/observability/ai-usage.service', () => ({
  AiUsageService: class {
    record = hoisted.usageRecord;
    hasBilledUnit = hoisted.hasBilledUnit;
  },
}));

import { ConfiguredLlmClient, hydrateRecipeSpec, getLlmClient } from '~/services/ai/llm.server';
import { AppError } from '~/services/errors/app-error.server';
import type { RecipeSpec } from '@superapp/core';

const ANTHROPIC_PROVIDER = {
  id: 'prov_anthropic',
  provider: 'ANTHROPIC',
  model: 'claude-sonnet-4-6',
  baseUrl: null,
  extraConfig: null,
};
const OPENAI_PROVIDER = {
  id: 'prov_openai',
  provider: 'OPENAI',
  model: 'gpt-5',
  baseUrl: null,
  extraConfig: null,
};

function llmResult(rawJson: string) {
  return { rawJson, tokensIn: 10, tokensOut: 20, model: 'test-model' };
}

const RECIPE_SPEC = {
  type: 'theme.section',
  name: 'Test Section',
  category: 'STOREFRONT_UI',
  requires: [],
  config: {},
} as unknown as RecipeSpec;

const VALID_ENVELOPE = {
  version: '1.0',
  moduleKey: 'exit-intent-popup',
  recipeRef: { type: 'theme.section', name: 'Test Section', category: 'STOREFRONT_UI' },
  summary: 'A summary.',
  assumptions: [],
  adminConfig: {
    schemaVersion: '1.0',
    jsonSchema: { type: 'object', properties: {}, required: [] },
    uiSchema: {},
    defaults: { content: {} },
  },
  themeEditorSettings: { fields: [{ id: 'enabled', type: 'boolean', label: 'Enable', default: true }], limitsNotes: [] },
  validationReport: { overall: 'PASS', checks: [], notes: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.priceFindFirst.mockResolvedValue(null);
  hoisted.appSettingsFindUnique.mockResolvedValue(null); // no manual fallback provider
  hoisted.providerFindFirst.mockResolvedValue(ANTHROPIC_PROVIDER); // legacy single-provider path (getLlmClient)
  hoisted.providerFindUnique.mockResolvedValue(ANTHROPIC_PROVIDER);
  hoisted.getApiKey.mockResolvedValue('sk-test');
  hoisted.hasBilledUnit.mockResolvedValue(false);
});

describe('ConfiguredLlmClient deadline budget (WS-C Task 10, C7)', () => {
  it('deadlineAt = now + 30s yields a bounded timeoutMs in [25_000, 30_000] passed to the Anthropic client', async () => {
    hoisted.providerFindUnique.mockResolvedValue(ANTHROPIC_PROVIDER);
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(llmResult('{}'));

    const client = new ConfiguredLlmClient(ANTHROPIC_PROVIDER.id);
    const now = Date.now();
    await client.generateRecipe('prompt', { deadlineAt: now + 30_000 });

    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
    const opts = hoisted.anthropicGenerateRecipe.mock.calls[0]![0] as { timeoutMs?: number };
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(25_000);
    expect(opts.timeoutMs).toBeLessThanOrEqual(30_000);
  });

  it('deadlineAt = now + 30s also bounds timeoutMs for the OpenAI client (Task 10 names both provider clients)', async () => {
    hoisted.providerFindUnique.mockResolvedValue(OPENAI_PROVIDER);
    hoisted.openAiGenerateRecipe.mockResolvedValueOnce(llmResult('{}'));

    const client = new ConfiguredLlmClient(OPENAI_PROVIDER.id);
    const now = Date.now();
    await client.generateRecipe('prompt', { deadlineAt: now + 30_000 });

    expect(hoisted.openAiGenerateRecipe).toHaveBeenCalledTimes(1);
    const opts = hoisted.openAiGenerateRecipe.mock.calls[0]![0] as { timeoutMs?: number };
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(25_000);
    expect(opts.timeoutMs).toBeLessThanOrEqual(30_000);
  });

  it('no deadlineAt hint: timeoutMs is undefined (unbounded — behavior unchanged)', async () => {
    hoisted.providerFindUnique.mockResolvedValue(ANTHROPIC_PROVIDER);
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(llmResult('{}'));

    const client = new ConfiguredLlmClient(ANTHROPIC_PROVIDER.id);
    await client.generateRecipe('prompt', {});

    const opts = hoisted.anthropicGenerateRecipe.mock.calls[0]![0] as { timeoutMs?: number };
    expect(opts.timeoutMs).toBeUndefined();
  });

  it('an already-exhausted deadline (< 5s remaining) throws a typed PROVIDER_ERROR AppError WITHOUT invoking the provider', async () => {
    hoisted.providerFindUnique.mockResolvedValue(ANTHROPIC_PROVIDER);

    const client = new ConfiguredLlmClient(ANTHROPIC_PROVIDER.id);
    const now = Date.now();

    await expect(client.generateRecipe('prompt', { deadlineAt: now + 2_000 })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
    await expect(client.generateRecipe('prompt', { deadlineAt: now + 2_000 })).rejects.toBeInstanceOf(AppError);
    expect(hoisted.anthropicGenerateRecipe).not.toHaveBeenCalled();
  });

  it('a deadline already in the past also throws PROVIDER_ERROR without invoking the provider', async () => {
    hoisted.providerFindUnique.mockResolvedValue(ANTHROPIC_PROVIDER);

    const client = new ConfiguredLlmClient(ANTHROPIC_PROVIDER.id);
    await expect(client.generateRecipe('prompt', { deadlineAt: Date.now() - 1_000 })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
    expect(hoisted.anthropicGenerateRecipe).not.toHaveBeenCalled();
  });
});

describe('hydrateRecipeSpec forwards deadlineAt into GenerateHints (WS-C Task 10, C7)', () => {
  it('hydrateRecipeSpec({ deadlineAt }) forwards it through to the provider client as a bounded timeoutMs', async () => {
    hoisted.providerFindUnique.mockResolvedValue(ANTHROPIC_PROVIDER);
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(llmResult(JSON.stringify(VALID_ENVELOPE)));

    const now = Date.now();
    await hydrateRecipeSpec(RECIPE_SPEC, { deadlineAt: now + 60_000 });

    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
    const opts = hoisted.anthropicGenerateRecipe.mock.calls[0]![0] as { timeoutMs?: number };
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(55_000);
    expect(opts.timeoutMs).toBeLessThanOrEqual(60_000);
  });

  it('hydrateRecipeSpec with no deadlineAt: timeoutMs is undefined (unbounded — behavior unchanged)', async () => {
    hoisted.providerFindUnique.mockResolvedValue(ANTHROPIC_PROVIDER);
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(llmResult(JSON.stringify(VALID_ENVELOPE)));

    await hydrateRecipeSpec(RECIPE_SPEC, {});

    const opts = hoisted.anthropicGenerateRecipe.mock.calls[0]![0] as { timeoutMs?: number };
    expect(opts.timeoutMs).toBeUndefined();
  });
});

describe('EnvGeminiClient forwards deadlineAt/timeoutMs (parked WS-C follow-up, closed 2026-08-27)', () => {
  // Unlike EnvOpenAiClient/EnvClaudeClient, EnvGeminiClient previously dropped
  // `hints.timeoutMs`/`hints.deadlineAt` on the floor instead of forwarding
  // them into `geminiGenerateRecipe` — a pre-existing gap parked in the WS-C
  // ledger. This exercises the real env-key fallback path in `getLlmClient`
  // (no DB provider configured, `defaultAiProvider: 'gemini'`, GEMINI_API_KEY
  // set) to prove the fix actually reaches the client call, mirroring the
  // ConfiguredLlmClient/Anthropic+OpenAI assertions above.
  const ORIGINAL_GEMINI_KEY = process.env.GEMINI_API_KEY;
  const ORIGINAL_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    hoisted.providerFindFirst.mockResolvedValue(null); // no active DB provider -> env fallback path
    hoisted.appSettingsFindUnique.mockResolvedValue({ defaultAiProvider: 'gemini' });
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_GEMINI_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_KEY;
    if (ORIGINAL_ANTHROPIC_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC_KEY;
    if (ORIGINAL_OPENAI_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
  });

  it('deadlineAt = now + 30s yields a bounded timeoutMs AND the raw deadlineAt forwarded to geminiGenerateRecipe', async () => {
    hoisted.geminiGenerateRecipe.mockResolvedValueOnce(llmResult('{}'));

    const { client, providerId } = await getLlmClient(null);
    expect(providerId).toBeNull();

    const now = Date.now();
    const deadlineAt = now + 30_000;
    await client.generateRecipe('prompt', { deadlineAt });

    expect(hoisted.geminiGenerateRecipe).toHaveBeenCalledTimes(1);
    const opts = hoisted.geminiGenerateRecipe.mock.calls[0]![0] as {
      timeoutMs?: number;
      deadlineAt?: number;
    };
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(25_000);
    expect(opts.timeoutMs).toBeLessThanOrEqual(30_000);
    expect(opts.deadlineAt).toBe(deadlineAt);
  });

  it('no deadlineAt hint: timeoutMs/deadlineAt are both undefined (unbounded — behavior unchanged)', async () => {
    hoisted.geminiGenerateRecipe.mockResolvedValueOnce(llmResult('{}'));

    const { client } = await getLlmClient(null);
    await client.generateRecipe('prompt', {});

    const opts = hoisted.geminiGenerateRecipe.mock.calls[0]![0] as {
      timeoutMs?: number;
      deadlineAt?: number;
    };
    expect(opts.timeoutMs).toBeUndefined();
    expect(opts.deadlineAt).toBeUndefined();
  });
});

describe('postJsonWithRetries deadlineAt (WS-C Task 10, C7)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('a deadlineAt tighter than the default 120s timeout aborts around the deadline, not the default', async () => {
    vi.useFakeTimers();
    let abortedAtMs: number | null = null;
    const fetchMock = vi.fn((_url: unknown, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          abortedAtMs = Date.now();
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const start = Date.now();
    const promise = postJsonWithRetries({
      url: 'https://example.test/v1/messages',
      headers: {},
      body: {},
      // Default timeoutMs (120_000) would abort far later than this — the
      // deadline must be the one that actually fires the abort. (Comfortably
      // above ai-http.server.ts's MIN_DEADLINE_BUDGET_MS floor, so the call
      // actually fires instead of failing fast pre-fetch — that fail-fast
      // case is covered separately in ai-http-deadline-retry.test.ts.)
      deadlineAt: start + 3_000,
      maxRetries: 0,
      logMeta: { provider: 'ANTHROPIC', model: 'test-model', actor: 'INTERNAL' },
    });
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;

    expect(abortedAtMs).not.toBeNull();
    expect(abortedAtMs! - start).toBeLessThanOrEqual(3_000);
  });

  it('deadlineAt looser than timeoutMs: timeoutMs still wins (the min() picks the tighter bound either way)', async () => {
    vi.useFakeTimers();
    let abortedAtMs: number | null = null;
    const fetchMock = vi.fn((_url: unknown, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          abortedAtMs = Date.now();
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const start = Date.now();
    const promise = postJsonWithRetries({
      url: 'https://example.test/v1/messages',
      headers: {},
      body: {},
      timeoutMs: 100,
      deadlineAt: start + 100_000, // far looser than timeoutMs
      maxRetries: 0,
      logMeta: { provider: 'ANTHROPIC', model: 'test-model', actor: 'INTERNAL' },
    });
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    expect(abortedAtMs).not.toBeNull();
    expect(abortedAtMs! - start).toBeLessThanOrEqual(100);
  });
});

/**
 * WS-C Task 12. Hydrate hardening: structured output (forces the provider to
 * emit the HydrateEnvelope shape), fence-strip (tolerates a model that wraps
 * its reply in ```json … ``` despite being told not to), and truncation
 * detection (a distinct `TruncatedOutputError` instead of either client
 * silently letting a truncated reply fall through to a generic parse
 * failure — Anthropic previously didn't detect it at all).
 *
 * `stripCodeFences` and `anthropicGenerateRecipe`'s truncation check are unit
 * tested directly. `hydrateRecipeSpec`'s retry/billing behavior is exercised
 * through the REAL function (same mocking pattern as
 * `hydrate-billing-dedupe.test.ts`): only its deep collaborators
 * (db.server, AiProviderService, the Anthropic client, AiUsageService) are
 * mocked.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { stripCodeFences } from '~/services/ai/tolerant-json.server';

describe('stripCodeFences (WS-C Task 12)', () => {
  it('strips a ```json fence, trims surrounding whitespace', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('is idempotent on bare (unfenced) JSON', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
    expect(stripCodeFences(stripCodeFences('```json\n{"a":1}\n```'))).toBe('{"a":1}');
  });

  it('strips a bare ``` fence with no language tag', () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

// Anthropic/OpenAI clients' own truncation detection (real client module,
// mocked `postJsonWithRetries`) live in `truncation-detection.test.ts` — a
// separate file because vitest's `vi.mock` is file-scoped and this file
// needs `anthropicGenerateRecipe` to be a STUBBED module (see below) for the
// `hydrateRecipeSpec` retry/billing tests, which conflicts with wanting the
// REAL `anthropicGenerateRecipe` implementation under test (same reasoning
// `hydrate-billing-dedupe.test.ts` documents at its own file split).

// --- hydrateRecipeSpec: retry/billing behavior, real function under test ---

const hoisted = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  providerFindFirst: vi.fn(),
  providerFindUnique: vi.fn(),
  appSettingsFindUnique: vi.fn(),
  priceFindFirst: vi.fn(),
  getApiKey: vi.fn(),
  anthropicGenerateRecipe: vi.fn(),
  usageRecord: vi.fn(async (_args: unknown) => {}),
  hasBilledUnit: vi.fn(async () => false),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: hoisted.shopFindUnique },
    aiProvider: { findFirst: hoisted.providerFindFirst, findUnique: hoisted.providerFindUnique },
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
vi.mock('~/services/observability/ai-usage.service', () => ({
  AiUsageService: class {
    record = hoisted.usageRecord;
    hasBilledUnit = hoisted.hasBilledUnit;
  },
}));

import { hydrateRecipeSpec } from '~/services/ai/llm.server';
import { TruncatedOutputError } from '~/services/ai/clients/truncation.server';
import type { RecipeSpec } from '@superapp/core';

const RECIPE_SPEC = {
  type: 'theme.section',
  name: 'Test Section',
  category: 'STOREFRONT_UI',
  requires: [],
  config: {},
} as unknown as RecipeSpec;

const PROVIDER = { id: 'prov_test', provider: 'ANTHROPIC', model: 'claude-sonnet-4-6', baseUrl: null, extraConfig: null };

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

function llmResult(rawJson: string) {
  return { rawJson, tokensIn: 10, tokensOut: 20, model: 'claude-sonnet-4-6', servedProviderId: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.shopFindUnique.mockResolvedValue(null);
  hoisted.appSettingsFindUnique.mockResolvedValue(null);
  hoisted.providerFindFirst.mockResolvedValue(PROVIDER);
  hoisted.providerFindUnique.mockResolvedValue(PROVIDER);
  hoisted.getApiKey.mockResolvedValue('sk-test');
  hoisted.priceFindFirst.mockResolvedValue(null);
  hoisted.hasBilledUnit.mockResolvedValue(false);
});

describe('hydrateRecipeSpec hardening (WS-C Task 12)', () => {
  it('a fenced valid envelope succeeds on the FIRST attempt — no retry, no failed-attempt row', async () => {
    const fenced = '```json\n' + JSON.stringify(VALID_ENVELOPE) + '\n```';
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(llmResult(fenced));

    const result = await hydrateRecipeSpec(RECIPE_SPEC, { shopId: undefined });

    expect(result.version).toBe('1.0');
    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
    const failedCalls = hoisted.usageRecord.mock.calls.filter(
      (call: unknown[]) => (call[0] as { action?: string })?.action === 'RECIPE_HYDRATE_FAILED',
    );
    expect(failedCalls).toHaveLength(0);
  });

  it('the first call\'s hints request structured output: responseSchema.name === "emit_hydrate_envelope"', async () => {
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(llmResult(JSON.stringify(VALID_ENVELOPE)));

    await hydrateRecipeSpec(RECIPE_SPEC, { shopId: undefined });

    const firstCallHints = hoisted.anthropicGenerateRecipe.mock.calls[0]![0];
    expect(firstCallHints.responseSchema?.name).toBe('emit_hydrate_envelope');
  });

  it('a TruncatedOutputError on attempt 1 then success on attempt 2: retry bumps maxTokens to 24_000, records one RECIPE_HYDRATE_FAILED row with requestCount 0', async () => {
    hoisted.anthropicGenerateRecipe
      .mockRejectedValueOnce(new TruncatedOutputError('Anthropic', 'stop_reason=max_tokens'))
      .mockResolvedValueOnce(llmResult(JSON.stringify(VALID_ENVELOPE)));

    const result = await hydrateRecipeSpec(RECIPE_SPEC, { shopId: undefined, maxAttempts: 2 });

    expect(result.version).toBe('1.0');
    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(2);

    const secondCallHints = hoisted.anthropicGenerateRecipe.mock.calls[1]![0];
    expect(secondCallHints.maxTokens).toBe(24_000);

    const failedCalls = hoisted.usageRecord.mock.calls.filter(
      (call: unknown[]) => (call[0] as { action?: string })?.action === 'RECIPE_HYDRATE_FAILED',
    );
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0]![0]).toMatchObject({ requestCount: 0 });

    const successCalls = hoisted.usageRecord.mock.calls.filter(
      (call: unknown[]) => (call[0] as { action?: string })?.action === 'RECIPE_HYDRATE',
    );
    expect(successCalls).toHaveLength(1);
  });

  it('every attempt exhausted by truncation: throws the friendly AppError with code OUTPUT_TRUNCATED', async () => {
    hoisted.anthropicGenerateRecipe
      .mockRejectedValueOnce(new TruncatedOutputError('Anthropic', 'stop_reason=max_tokens'))
      .mockRejectedValueOnce(new TruncatedOutputError('Anthropic', 'stop_reason=max_tokens'));

    const { AppError } = await import('~/services/errors/app-error.server');

    const caught = await hydrateRecipeSpec(RECIPE_SPEC, { shopId: undefined, maxAttempts: 2 }).catch((e) => e);
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({ code: 'OUTPUT_TRUNCATED' });
  });
});

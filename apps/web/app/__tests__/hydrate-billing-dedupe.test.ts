/**
 * WS-C Task 8 (C8): `hydrateRecipeSpec`'s retry-safe billing. Exercises the
 * REAL `hydrateRecipeSpec` (not mocked — this is the function under test),
 * with its LLM-client stack (getLlmClient -> ConfiguredLlmClient -> the
 * Anthropic client) and `AiUsageService` mocked, following the same
 * mocking pattern as `get-llm-client-cost-routing.test.ts`.
 *
 * Kept in its own file (not `ai-hydrate-processor.test.ts`, despite the
 * plan's "same file" wording) because these tests need `~/services/ai/llm.server`
 * to be the REAL module (only `hydrateRecipeSpec`'s deep collaborators
 * mocked), while the processor tests need the WHOLE module mocked
 * (`hydrateRecipeSpec` itself stubbed) — vitest's `vi.mock` is file-scoped,
 * so one file can't do both.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

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
    // attributeServedCost -> estimateCostCentsFromDb -> estimateCostCentsFromDbRates
    // looks up a price row; absent (null) just means costCents resolves to 0,
    // which is fine here since these tests assert requestCount, not cost.
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
  hoisted.shopFindUnique.mockResolvedValue(null); // no per-shop override
  hoisted.appSettingsFindUnique.mockResolvedValue(null); // no manual fallback provider
  hoisted.providerFindFirst.mockResolvedValue(PROVIDER); // legacy single-provider path
  hoisted.providerFindUnique.mockResolvedValue(PROVIDER);
  hoisted.getApiKey.mockResolvedValue('sk-test');
  hoisted.priceFindFirst.mockResolvedValue(null);
  hoisted.hasBilledUnit.mockResolvedValue(false);
});

describe('hydrateRecipeSpec billing (C8, WS-C Task 8)', () => {
  it('no billingKey (inline route path, unchanged): a successful attempt bills requestCount 1 with no correlationId override', async () => {
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(llmResult(JSON.stringify(VALID_ENVELOPE)));

    await hydrateRecipeSpec(RECIPE_SPEC, { shopId: undefined });

    expect(hoisted.hasBilledUnit).not.toHaveBeenCalled();
    expect(hoisted.usageRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RECIPE_HYDRATE', requestCount: 1, correlationId: undefined }),
    );
  });

  it('with a billingKey and hasBilledUnit=false: the first successful attempt claims requestCount 1, correlationId === billingKey', async () => {
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(llmResult(JSON.stringify(VALID_ENVELOPE)));

    await hydrateRecipeSpec(RECIPE_SPEC, { billingKey: 'hydrate:job-1' });

    expect(hoisted.hasBilledUnit).toHaveBeenCalledWith('hydrate:job-1', { action: 'RECIPE_HYDRATE' });
    expect(hoisted.usageRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RECIPE_HYDRATE', requestCount: 1, correlationId: 'hydrate:job-1' }),
    );
  });

  it('with a billingKey and hasBilledUnit=true (a BullMQ retry\'s success after an earlier successful write): claims requestCount 0', async () => {
    hoisted.hasBilledUnit.mockResolvedValue(true);
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(llmResult(JSON.stringify(VALID_ENVELOPE)));

    await hydrateRecipeSpec(RECIPE_SPEC, { billingKey: 'hydrate:job-1' });

    expect(hoisted.usageRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RECIPE_HYDRATE', requestCount: 0, correlationId: 'hydrate:job-1' }),
    );
  });

  it('a failed-then-successful sequence: the failed attempt bills 0 (RECIPE_HYDRATE_FAILED), the successful retry claims 1', async () => {
    hoisted.anthropicGenerateRecipe
      .mockResolvedValueOnce(llmResult('not valid json'))
      .mockResolvedValueOnce(llmResult(JSON.stringify(VALID_ENVELOPE)));

    await hydrateRecipeSpec(RECIPE_SPEC, { billingKey: 'hydrate:job-1' });

    expect(hoisted.usageRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: 'RECIPE_HYDRATE_FAILED', requestCount: 0, correlationId: 'hydrate:job-1' }),
    );
    expect(hoisted.usageRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: 'RECIPE_HYDRATE', requestCount: 1, correlationId: 'hydrate:job-1' }),
    );
  });

  it('a failed attempt bills 0 even WITHOUT a billingKey (C8 unconditional — the merchant got nothing)', async () => {
    hoisted.anthropicGenerateRecipe
      .mockResolvedValueOnce(llmResult('not valid json'))
      .mockResolvedValueOnce(llmResult(JSON.stringify(VALID_ENVELOPE)));

    await hydrateRecipeSpec(RECIPE_SPEC, {});

    expect(hoisted.usageRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: 'RECIPE_HYDRATE_FAILED', requestCount: 0 }),
    );
    expect(hoisted.usageRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: 'RECIPE_HYDRATE', requestCount: 1 }),
    );
  });

  it('every attempt exhausted (maxAttempts) without a valid envelope: throws, and no successful-billing write happens', async () => {
    hoisted.anthropicGenerateRecipe.mockResolvedValue(llmResult('still not valid json'));

    await expect(hydrateRecipeSpec(RECIPE_SPEC, { billingKey: 'hydrate:job-1', maxAttempts: 2 })).rejects.toThrow(
      /Hydrate envelope validation failed/,
    );

    expect(hoisted.usageRecord).toHaveBeenCalledTimes(2);
    for (const call of hoisted.usageRecord.mock.calls) {
      expect(call[0]).toMatchObject({ action: 'RECIPE_HYDRATE_FAILED', requestCount: 0 });
    }
  });
});

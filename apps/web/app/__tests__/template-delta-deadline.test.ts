/**
 * WS-C Task 10 (C7) fix round 1. `generateRecipeViaDelta` (the Tier-1
 * "instantiate + delta-edit" path — option 0's flagship path whenever a
 * tier-1 exemplar exists, `template-delta.server.ts`) previously did NOT
 * accept or forward `deadlineAt`, leaving the one LLM call it makes
 * completely unbounded regardless of how little of the worker job's budget
 * remained. Covers, using a REAL `ConfiguredLlmClient` (same mocking
 * pattern as `deadline-budget.test.ts`) so the deadline machinery under
 * test is the real thing, not a stand-in:
 *  - a nearly-exhausted deadline fails fast with the typed PROVIDER_ERROR
 *    AppError, WITHOUT invoking the provider client;
 *  - a healthy deadline passes a bounded `timeoutMs` through to the
 *    provider client (and into the repair-loop call, if one happens).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  providerFindUnique: vi.fn(),
  getApiKey: vi.fn(),
  anthropicGenerateRecipe: vi.fn(),
  priceFindFirst: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiProvider: { findUnique: hoisted.providerFindUnique },
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

import { ConfiguredLlmClient } from '~/services/ai/llm.server';
import { AppError } from '~/services/errors/app-error.server';
import { generateRecipeViaDelta } from '~/services/ai/template-delta.server';

const ANTHROPIC_PROVIDER = {
  id: 'prov_anthropic',
  provider: 'ANTHROPIC',
  model: 'claude-sonnet-4-6',
  baseUrl: null,
  extraConfig: null,
};

const TEMPLATE = {
  type: 'theme.section',
  name: 'Stub Banner',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: { kind: 'banner', activation: 'section', fields: { heading: 'Hello', enableAnimation: false }, blocks: [] },
};
const TEMPLATE_JSON = JSON.stringify(TEMPLATE);

function llmResult(rawJson: string) {
  return { rawJson, tokensIn: 10, tokensOut: 20, model: 'claude-sonnet-4-6' };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.providerFindUnique.mockResolvedValue(ANTHROPIC_PROVIDER);
  hoisted.getApiKey.mockResolvedValue('sk-test');
  hoisted.priceFindFirst.mockResolvedValue(null);
});

describe('generateRecipeViaDelta deadline budget (WS-C Task 10, C7, fix round 1)', () => {
  it('a nearly-exhausted deadline (< 5s remaining) fails fast with a typed PROVIDER_ERROR, WITHOUT invoking the provider', async () => {
    const client = new ConfiguredLlmClient(ANTHROPIC_PROVIDER.id);
    const now = Date.now();

    await expect(
      generateRecipeViaDelta({
        client,
        templateSpecJson: TEMPLATE_JSON,
        moduleType: 'theme.section',
        userRequest: 'summer sale banner',
        maxTokens: 1200,
        deadlineAt: now + 2_000,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    await expect(
      generateRecipeViaDelta({
        client,
        templateSpecJson: TEMPLATE_JSON,
        moduleType: 'theme.section',
        userRequest: 'summer sale banner',
        maxTokens: 1200,
        deadlineAt: now + 2_000,
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(hoisted.anthropicGenerateRecipe).not.toHaveBeenCalled();
  });

  it('a healthy deadline passes a bounded timeoutMs through to the provider client', async () => {
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(
      llmResult(JSON.stringify({ explanation: 'Adapted', patch: { name: 'Summer Sale Banner' } })),
    );
    const client = new ConfiguredLlmClient(ANTHROPIC_PROVIDER.id);
    const now = Date.now();

    const { recipe } = await generateRecipeViaDelta({
      client,
      templateSpecJson: TEMPLATE_JSON,
      moduleType: 'theme.section',
      userRequest: 'summer sale banner',
      maxTokens: 1200,
      deadlineAt: now + 30_000,
    });

    expect(recipe.name).toBe('Summer Sale Banner');
    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
    const opts = hoisted.anthropicGenerateRecipe.mock.calls[0]![0] as { timeoutMs?: number; deadlineAt?: number };
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(25_000);
    expect(opts.timeoutMs).toBeLessThanOrEqual(30_000);
    expect(opts.deadlineAt).toBe(now + 30_000);
  });

  it('a healthy deadline also bounds the repair-loop call when the patched recipe needs repair', async () => {
    hoisted.anthropicGenerateRecipe
      // Patch makes config a non-object -> fails Zod, routes to the repair loop.
      .mockResolvedValueOnce(llmResult(JSON.stringify({ patch: { config: 'not-an-object' } })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({ recipe: { ...TEMPLATE, name: 'Repaired Banner' } })));
    const client = new ConfiguredLlmClient(ANTHROPIC_PROVIDER.id);
    const now = Date.now();

    const { recipe } = await generateRecipeViaDelta({
      client,
      templateSpecJson: TEMPLATE_JSON,
      moduleType: 'theme.section',
      userRequest: 'fix it',
      maxTokens: 1200,
      deadlineAt: now + 30_000,
    });

    expect(recipe.name).toBe('Repaired Banner');
    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(2);
    for (const call of hoisted.anthropicGenerateRecipe.mock.calls) {
      const opts = call[0] as { timeoutMs?: number };
      expect(opts.timeoutMs).toBeGreaterThanOrEqual(25_000);
      expect(opts.timeoutMs).toBeLessThanOrEqual(30_000);
    }
  });

  it('no deadlineAt: timeoutMs is undefined (unbounded — behavior unchanged)', async () => {
    hoisted.anthropicGenerateRecipe.mockResolvedValueOnce(
      llmResult(JSON.stringify({ explanation: 'Adapted', patch: { name: 'Summer Sale Banner' } })),
    );
    const client = new ConfiguredLlmClient(ANTHROPIC_PROVIDER.id);

    await generateRecipeViaDelta({
      client,
      templateSpecJson: TEMPLATE_JSON,
      moduleType: 'theme.section',
      userRequest: 'summer sale banner',
      maxTokens: 1200,
    });

    const opts = hoisted.anthropicGenerateRecipe.mock.calls[0]![0] as { timeoutMs?: number };
    expect(opts.timeoutMs).toBeUndefined();
  });
});

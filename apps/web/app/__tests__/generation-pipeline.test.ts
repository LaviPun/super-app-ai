import { expect, it, vi } from 'vitest';

vi.mock('~/services/ai/classify.server', () => ({
  classifyUserIntent: vi.fn(async () => ({ moduleType: 'theme.section', intent: 'banner' })),
  CONFIDENCE_THRESHOLDS: { DIRECT: 0.8, WITH_ALTERNATIVES: 0.55 },
}));
vi.mock('~/services/ai/cheap-classifier.server', () => ({
  augmentWithCheapClassifier: vi.fn(async (c: unknown) => c),
}));
vi.mock('~/services/ai/intent-packet.server', () => ({
  buildIntentPacket: vi.fn(() => ({
    classification: { intent: 'banner', surface: 'storefront', confidence: 0.9, alternatives: [], reasons: [] },
    routing: { prompt_profile: 'p' },
  })),
}));
vi.mock('~/services/ai/prompt-router.server', () => ({ buildPromptRouterDecision: vi.fn(async () => ({ includeFlags: {} })) }));
vi.mock('~/services/ai/requirement-spec.server', () => ({ extractRequirementSpec: vi.fn(async () => ({})) }));
vi.mock('~/services/ai/solution-search.server', () => ({ searchSolutions: vi.fn(() => ({ grounding: '', exemplar: undefined, startFrom: [] })) }));
vi.mock('~/services/theme/ensure-aesthetic.server', () => ({ ensureStoreAesthetic: vi.fn(async () => {}) }));
vi.mock('~/services/ai/design-reference.server', () => ({ loadStoreAesthetic: vi.fn(async () => null) }));
vi.mock('~/services/ai/blueprint-planner', () => ({ planBlueprint: vi.fn(() => ({ kind: 'single' })) }));
vi.mock('~/services/ai/apply-composition.server', () => ({ applyCompositionRules: vi.fn() }));

const recipe = { type: 'theme.section', name: 'X', category: 'STOREFRONT_UI', requires: [], config: {} };
vi.mock('~/services/ai/llm.server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateValidatedRecipeOptionsStream: vi.fn(async function* () {
    yield { kind: 'started', index: 0, approach: 'a', total: 2 };
    yield { kind: 'option', index: 0, approach: 'a', option: { explanation: 'e0', recipe }, durationMs: 10 };
    yield { kind: 'option_failed', index: 1, approach: 'b', error: 'nope', durationMs: 12 };
    yield { kind: 'done', valid: 1, total: 2 };
  }),
}));

import { runGenerationPipeline } from '~/services/ai/generation-pipeline.server';

it('drives hooks in order and returns final options', async () => {
  const calls: string[] = [];
  const result = await runGenerationPipeline(
    {
      shopId: 's1', shopDomain: 'x.myshopify.com', prompt: 'make a banner',
      preferredType: 'Auto', preferredCategory: 'Auto', preferredBlockType: 'Auto',
      matchStoreColors: true, planTier: 'BASIC', admin: {} as never,
    },
    {
      onStage: (s) => { calls.push(`stage:${s}`); },
      onIntent: () => { calls.push('intent'); },
      onOption: (o) => { calls.push(`option:${o.index}`); },
      onOptionFailed: (o) => { calls.push(`failed:${o.index}`); },
      onRanking: (r) => { calls.push(`ranking:${r.recommendedIndex}`); },
    },
  );
  expect(result.validCount).toBe(1);
  expect(result.collected.get(0)?.explanation).toBe('e0');
  expect(calls).toEqual([
    'stage:classifying', 'intent', 'stage:generating', 'option:0', 'failed:1', 'stage:ranking', 'ranking:0', 'stage:finalizing',
  ]);
});

it('isAborted stops consumption and skips the blueprint phase', async () => {
  const onOption = vi.fn();
  const res = await runGenerationPipeline(
    { shopId: 's1', shopDomain: 'x.myshopify.com', prompt: 'p', preferredType: 'Auto', preferredCategory: 'Auto', preferredBlockType: 'Auto', matchStoreColors: false, planTier: 'BASIC', admin: {} as never },
    { isAborted: () => true, onOption },
  );
  expect(onOption).not.toHaveBeenCalled();
  expect(res.validCount).toBe(0);
});

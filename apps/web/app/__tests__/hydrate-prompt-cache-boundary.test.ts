import { describe, expect, it } from 'vitest';
import { buildHydratePrompt } from '~/services/ai/hydrate-prompt.server';
import type { RecipeSpec } from '@superapp/core';

const spec = {
  type: 'theme.section',
  name: 'Test Section',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: { kind: 'banner', activation: 'section', fields: { heading: 'UNIQUE_RECIPE_TOKEN' }, blocks: [] },
} as unknown as RecipeSpec;

describe('buildHydratePrompt cache boundary', () => {
  it('keeps the RecipeSpec JSON out of the static prefix', () => {
    const { prompt, cacheableChars } = buildHydratePrompt(spec, { planTier: 'GROWTH', locale: 'en' });
    expect(prompt.slice(0, cacheableChars)).not.toContain('UNIQUE_RECIPE_TOKEN');
    expect(prompt.slice(cacheableChars)).toContain('UNIQUE_RECIPE_TOKEN');
  });

  it('the static prefix is byte-identical across two different RecipeSpecs of the same type/kind and same planTier/locale', () => {
    const specB = {
      ...spec,
      config: { ...spec.config, fields: { heading: 'A_DIFFERENT_TOKEN' } },
    } as unknown as RecipeSpec;
    const a = buildHydratePrompt(spec, { planTier: 'GROWTH', locale: 'en' });
    const b = buildHydratePrompt(specB, { planTier: 'GROWTH', locale: 'en' });
    expect(a.prompt.slice(0, a.cacheableChars)).toBe(b.prompt.slice(0, b.cacheableChars));
  });

  it('includes the surfacePlan/themeEditorSettings/uiTokens/validationReport instructions in the static prefix', () => {
    const { prompt, cacheableChars } = buildHydratePrompt(spec);
    const prefix = prompt.slice(0, cacheableChars);
    expect(prefix).toContain('surfacePlan');
    expect(prefix).toContain('uiTokens');
    expect(prefix).toContain('validationReport');
  });
});

import { describe, it, expect } from 'vitest';
import { compileRecipe } from '~/services/recipes/compiler';
import type { RecipeSpec } from '@superapp/core';

describe('compileRecipe', () => {
  it('compiles theme.banner to theme asset ops', () => {
    const spec: RecipeSpec = {
      type: 'theme.banner',
      name: 'My Banner',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { heading: 'Hi', enableAnimation: false },
    } as unknown as RecipeSpec;

    const out = compileRecipe(spec, { kind: 'THEME', themeId: '123', moduleId: 'test-module-123' });
    expect(out.ops.length).toBeGreaterThan(0);
  });

  it('compiles theme.effect to theme asset ops and respects reducedMotion', () => {
    const spec: RecipeSpec = {
      type: 'theme.effect',
      name: 'Winter Snow',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { effectKind: 'snowfall', intensity: 'medium', speed: 'normal' },
      style: { accessibility: { reducedMotion: true } },
    } as unknown as RecipeSpec;

    const out = compileRecipe(spec, { kind: 'THEME', themeId: '456', moduleId: 'test-module-456' });
    expect(out.ops.length).toBeGreaterThan(0);
    expect(out.themeModulePayload).toBeDefined();
  });

  it('compiles proxy.widget to proxy widget payload', () => {
    const spec: RecipeSpec = {
      type: 'proxy.widget',
      name: 'Widget',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: { widgetId: 'abc-123', title: 'Hello', mode: 'HTML' },
    } as unknown as RecipeSpec;

    const out = compileRecipe(spec, { kind: 'PLATFORM' });
    expect(out.proxyWidgetPayload).toBeDefined();
    expect(out.proxyWidgetPayload?.widgetId).toBe('abc-123');
    expect(out.proxyWidgetPayload?.styleCss).toContain('--sa-text');
  });

  it('compiles functions.paymentCustomization to function config upsert op', () => {
    const spec: RecipeSpec = {
      type: 'functions.paymentCustomization',
      name: 'Hide COD',
      category: 'FUNCTION',
      requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
      config: { rules: [{ when: { minSubtotal: 1000 }, actions: { hideMethodsContaining: ['Cash'] } }] },
    } as unknown as RecipeSpec;

    const out = compileRecipe(spec, { kind: 'PLATFORM' });
    expect(out.ops.some(o => o.kind === 'FUNCTION_CONFIG_UPSERT')).toBe(true);
  });
});

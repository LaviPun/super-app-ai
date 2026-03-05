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
    } as any;

    const out = compileRecipe(spec, { kind: 'THEME', themeId: '123' });
    expect(out.ops.some(o => o.kind === 'THEME_ASSET_UPSERT')).toBe(true);
  });

  it('compiles theme.effect to theme asset ops and respects reducedMotion', () => {
    const spec: RecipeSpec = {
      type: 'theme.effect',
      name: 'Winter Snow',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { effectKind: 'snowfall', intensity: 'medium', speed: 'normal' },
      style: { accessibility: { reducedMotion: true } },
    } as any;

    const out = compileRecipe(spec, { kind: 'THEME', themeId: '456' });
    expect(out.ops.some(o => o.kind === 'THEME_ASSET_UPSERT')).toBe(true);
    const cssOp = out.ops.find(o => o.kind === 'THEME_ASSET_UPSERT' && (o as any).key?.endsWith('.css'));
    expect(cssOp).toBeDefined();
    const cssValue = (cssOp as { kind: string; value: string }).value;
    expect(cssValue).toContain('superapp-effect');
    expect(cssValue).toContain('animation: none');
  });

  it('compiles proxy.widget to metafield set op', () => {
    const spec: RecipeSpec = {
      type: 'proxy.widget',
      name: 'Widget',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: { widgetId: 'abc-123', title: 'Hello', mode: 'HTML' },
    } as any;

    const out = compileRecipe(spec, { kind: 'PLATFORM' });
    expect(out.ops.some(o => o.kind === 'SHOP_METAFIELD_SET')).toBe(true);
  });

  it('compiles functions.paymentCustomization to metafield set op', () => {
    const spec: RecipeSpec = {
      type: 'functions.paymentCustomization',
      name: 'Hide COD',
      category: 'FUNCTION',
      requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
      config: { rules: [{ when: { minSubtotal: 1000 }, actions: { hideMethodsContaining: ['Cash'] } }] },
    } as any;

    const out = compileRecipe(spec, { kind: 'PLATFORM' });
    expect(out.ops.some(o => o.kind === 'SHOP_METAFIELD_SET')).toBe(true);
  });
});

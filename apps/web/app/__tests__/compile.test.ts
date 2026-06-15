import { describe, it, expect } from 'vitest';
import { compileRecipe } from '~/services/recipes/compiler';
import type { RecipeSpec } from '@superapp/core';

describe('compileRecipe', () => {
  it('compiles theme.section (banner kind) to theme asset ops', () => {
    const spec: RecipeSpec = {
      type: 'theme.section',
      name: 'My Banner',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'banner', activation: 'section', fields: { heading: 'Hi', enableAnimation: false }, blocks: [] },
    } as unknown as RecipeSpec;

    const out = compileRecipe(spec, { kind: 'THEME', themeId: '123', moduleId: 'test-module-123' });
    expect(out.ops.length).toBeGreaterThan(0);
  });

  it('compiles theme.section (effect kind) to theme asset ops and respects reducedMotion', () => {
    const spec: RecipeSpec = {
      type: 'theme.section',
      name: 'Winter Snow',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'effect', activation: 'overlay', fields: {}, blocks: [], effectKind: 'snowfall', intensity: 'medium', speed: 'normal' },
      style: { accessibility: { reducedMotion: true } },
    } as unknown as RecipeSpec;

    const out = compileRecipe(spec, { kind: 'THEME', themeId: '456', moduleId: 'test-module-456' });
    expect(out.ops.length).toBeGreaterThan(0);
    expect(out.themeModulePayload).toBeDefined();
  });

  it('compiles theme.section (contactForm kind) to theme module payload', () => {
    const spec: RecipeSpec = {
      type: 'theme.section',
      name: 'Contact',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'contactForm',
        activation: 'section',
        fields: {},
        blocks: [],
        title: 'Contact us',
        submitLabel: 'Send',
        successMessage: 'Thanks',
        errorMessage: 'Please retry',
      },
    } as unknown as RecipeSpec;

    const out = compileRecipe(spec, { kind: 'THEME', themeId: '789', moduleId: 'test-module-789' });
    expect(out.ops.length).toBeGreaterThan(0);
    expect(out.themeModulePayload?.type).toBe('theme.section');
    expect(out.themeModulePayload?.activationType).toBe('section');
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

  it('compiles functions.fulfillmentConstraints to function config upsert op', () => {
    const spec: RecipeSpec = {
      type: 'functions.fulfillmentConstraints',
      name: 'Ship fragile alone',
      category: 'FUNCTION',
      requires: [],
      config: { rules: [{ when: { productTagIn: ['fragile'] }, apply: { shipAlone: true } }] },
    } as unknown as RecipeSpec;

    const out = compileRecipe(spec, { kind: 'PLATFORM' });
    const op = out.ops.find(o => o.kind === 'FUNCTION_CONFIG_UPSERT');
    expect(op).toBeDefined();
    expect((op as { functionKey: string }).functionKey).toBe('fulfillmentConstraints');
  });

  it('compiles functions.orderRoutingLocationRule to function config upsert op', () => {
    const spec: RecipeSpec = {
      type: 'functions.orderRoutingLocationRule',
      name: 'Prefer EU warehouse',
      category: 'FUNCTION',
      requires: [],
      config: { rules: [{ when: { countryCode: 'DE' }, apply: { preferLocationId: 'gid://shopify/Location/1', priority: 10 } }] },
    } as unknown as RecipeSpec;

    const out = compileRecipe(spec, { kind: 'PLATFORM' });
    const op = out.ops.find(o => o.kind === 'FUNCTION_CONFIG_UPSERT');
    expect(op).toBeDefined();
    expect((op as { functionKey: string }).functionKey).toBe('orderRoutingLocationRule');
  });
});

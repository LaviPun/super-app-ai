import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, RECIPE_SPEC_TYPES, type RecipeSpec } from '@superapp/core';
import { PREVIEW_KINDS, defaultSimulationInput } from '@superapp/platform-contracts';
import { PreviewService } from '~/services/preview/preview.service';
import { simulateFunction } from '~/services/preview/function-simulation.server';

const service = new PreviewService();

/** One representative spec per RecipeSpec type, taken from the template catalog. */
function specForType(type: string): RecipeSpec | undefined {
  return MODULE_TEMPLATES.find((t) => t.spec.type === type)?.spec;
}

// Markers from the removed static-diagram renderer; must never reappear.
const PLACEHOLDER_MARKERS = ['Merchant-like structured preview', 'Workflow context', 'Template config snapshot'];

describe('WS4 live preview — coverage', () => {
  it('PREVIEW_KINDS covers every RECIPE_SPEC_TYPES entry (no drift)', () => {
    for (const type of RECIPE_SPEC_TYPES) {
      expect(PREVIEW_KINDS).toContain(type);
    }
  });

  it('SC-001: every type returns an interactive preview, not the placeholder diagram', () => {
    const missing: string[] = [];
    for (const type of RECIPE_SPEC_TYPES) {
      const spec = specForType(type);
      if (!spec) {
        missing.push(type);
        continue;
      }
      const preview = service.render(spec);
      expect(preview.kind).toBe('HTML');
      if (preview.kind === 'HTML') {
        for (const marker of PLACEHOLDER_MARKERS) {
          expect(preview.html).not.toContain(marker);
        }
        // Interactive previews carry one of the real renderer roots — `sf` is the
        // surface-authentic frame root (admin/POS/checkout/functions/messaging/…);
        // the `superapp-*` roots are the storefront module/widget renderers.
        expect(preview.html).toMatch(/class="(sf sf--|superapp-widget|superapp-popup|superapp-section|superapp-banner|superapp-notibar|superapp-contact|superapp-effect|superapp-floating)/);
      }
    }
    // Every type in the union must have at least one catalog template to preview.
    expect(missing).toEqual([]);
  });
});

describe('WS4 function simulation — SC-003', () => {
  it('applies a VIP percentage discount for a qualifying cart', () => {
    const spec = {
      type: 'functions.discountRules',
      name: 'VIP discount',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [{ when: { customerTags: ['VIP'], minSubtotal: 100 }, apply: { percentageOff: 15 } }],
        combineWithOtherDiscounts: true,
      },
    } as unknown as RecipeSpec;
    const result = simulateFunction(spec as never, defaultSimulationInput());
    expect(result.kind).toBe('functions.discountRules');
    expect(result.outcomes[0]?.effect).toBe('applied');
    expect(result.outcomes[0]?.label).toContain('15% off');
  });

  it('hides a shipping method by name', () => {
    const spec = {
      type: 'functions.deliveryCustomization',
      name: 'Hide economy',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: { rules: [{ when: {}, actions: { hideMethodsContaining: ['Economy'] } }] },
    } as unknown as RecipeSpec;
    const result = simulateFunction(spec as never, defaultSimulationInput());
    expect(result.outcomes.some((o) => o.effect === 'hidden' && o.label.includes('Economy'))).toBe(true);
  });

  it('shows the non-Plus fallback for cart transforms', () => {
    const spec = {
      type: 'functions.cartTransform',
      name: 'Bundle',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'BUNDLE',
        bundles: [{ title: 'Kit', componentSkus: ['BACKPACK-1', 'CUBE-SET'], bundleSku: 'KIT-1' }],
        fallbackTheme: { enabled: true, notificationMessage: 'Bundling requires Shopify Plus.' },
      },
    } as unknown as RecipeSpec;
    const nonPlus = { ...defaultSimulationInput(), isPlus: false };
    const result = simulateFunction(spec as never, nonPlus);
    expect(result.fallbackNote).toContain('Plus');
  });

  it('forms a bundle on a Plus store when components are present', () => {
    const spec = {
      type: 'functions.cartTransform',
      name: 'Bundle',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'BUNDLE',
        bundles: [{ title: 'Kit', componentSkus: ['BACKPACK-1', 'CUBE-SET'], bundleSku: 'KIT-1' }],
        fallbackTheme: { enabled: true, notificationMessage: 'x' },
      },
    } as unknown as RecipeSpec;
    const result = simulateFunction(spec as never, defaultSimulationInput());
    expect(result.outcomes.some((o) => o.effect === 'bundled')).toBe(true);
  });
});

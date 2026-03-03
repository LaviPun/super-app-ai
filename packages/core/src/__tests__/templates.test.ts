import { describe, it, expect } from 'vitest';
import { MODULE_TEMPLATES, findTemplate, TEMPLATE_CATEGORIES } from '../templates.js';
import { RecipeSpecSchema } from '../recipe.js';

describe('MODULE_TEMPLATES integrity', () => {
  it('every template has matching type and spec.type', () => {
    for (const t of MODULE_TEMPLATES) {
      expect(t.type).toBe(t.spec.type);
    }
  });

  it('every template has matching category and spec.category', () => {
    for (const t of MODULE_TEMPLATES) {
      expect(t.category).toBe(t.spec.category);
    }
  });

  it('all template IDs are unique', () => {
    const ids = MODULE_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template spec validates against RecipeSpecSchema', () => {
    for (const t of MODULE_TEMPLATES) {
      const result = RecipeSpecSchema.safeParse(t.spec);
      expect(result.success, `Template ${t.id} (${t.type}) failed validation: ${JSON.stringify(result.success ? null : result.error.flatten())}`).toBe(true);
    }
  });

  it('covers all RecipeSpec type variants', () => {
    const coveredTypes = new Set(MODULE_TEMPLATES.map(t => t.type));
    const expectedTypes = [
      'theme.banner',
      'theme.popup',
      'theme.notificationBar',
      'proxy.widget',
      'functions.discountRules',
      'functions.deliveryCustomization',
      'functions.paymentCustomization',
      'functions.cartAndCheckoutValidation',
      'functions.cartTransform',
      'checkout.upsell',
      'integration.httpSync',
      'flow.automation',
      'platform.extensionBlueprint',
      'customerAccount.blocks',
    ];
    for (const t of expectedTypes) {
      expect(coveredTypes.has(t), `Missing template for type: ${t}`).toBe(true);
    }
  });

  it('every template category is in TEMPLATE_CATEGORIES', () => {
    for (const t of MODULE_TEMPLATES) {
      expect((TEMPLATE_CATEGORIES as readonly string[]).includes(t.category)).toBe(true);
    }
  });

  it('findTemplate returns the correct template', () => {
    const banner = findTemplate('tpl-banner-promo');
    expect(banner).toBeDefined();
    expect(banner!.spec.type).toBe('theme.banner');

    const popup = findTemplate('tpl-popup-exit');
    expect(popup).toBeDefined();
    expect(popup!.spec.type).toBe('theme.popup');

    const flow = findTemplate('tpl-flow-order-tag');
    expect(flow).toBeDefined();
    expect(flow!.spec.type).toBe('flow.automation');
  });

  it('findTemplate returns undefined for unknown id', () => {
    expect(findTemplate('nonexistent')).toBeUndefined();
  });
});

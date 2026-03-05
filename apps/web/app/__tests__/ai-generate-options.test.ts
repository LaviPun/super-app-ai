import { describe, it, expect } from 'vitest';
import { getRecipeJsonSchema, getProposalSetSchema } from '~/services/ai/recipe-json-schema.server';
import { MODULE_SUMMARIES, getModuleSummary, getAllTypesSummary } from '~/services/ai/module-summaries.server';
import { classifyUserIntent } from '~/services/ai/classify.server';

describe('getRecipeJsonSchema', () => {
  it('returns root type "object" with properties.recipe', () => {
    const schema = getRecipeJsonSchema() as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['recipe']);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toBeDefined();
    const props = schema.properties as Record<string, unknown>;
    expect(props.recipe).toBeDefined();
  });
});

describe('getProposalSetSchema', () => {
  it('returns root object with options array', () => {
    const schema = getProposalSetSchema() as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['options']);
    const props = schema.properties as Record<string, unknown>;
    const options = props.options as Record<string, unknown>;
    expect(options.type).toBe('array');
    expect(options.minItems).toBe(3);
    expect(options.maxItems).toBe(3);
    const items = options.items as Record<string, unknown>;
    expect(items.required).toEqual(['explanation', 'recipe']);
  });
});

describe('MODULE_SUMMARIES', () => {
  const ALL_TYPES = [
    'theme.banner', 'theme.popup', 'theme.notificationBar', 'theme.effect', 'proxy.widget',
    'functions.discountRules', 'functions.deliveryCustomization', 'functions.paymentCustomization',
    'functions.cartAndCheckoutValidation', 'functions.cartTransform',
    'functions.fulfillmentConstraints', 'functions.orderRoutingLocationRule',
    'checkout.upsell', 'checkout.block', 'postPurchase.offer',
    'admin.block', 'pos.extension', 'analytics.pixel',
    'integration.httpSync', 'flow.automation',
    'platform.extensionBlueprint', 'customerAccount.blocks',
  ];

  it('covers all module types', () => {
    for (const type of ALL_TYPES) {
      expect(MODULE_SUMMARIES[type as keyof typeof MODULE_SUMMARIES], `Missing summary for ${type}`).toBeDefined();
      expect(MODULE_SUMMARIES[type as keyof typeof MODULE_SUMMARIES].length).toBeGreaterThan(50);
    }
  });

  it('getModuleSummary returns non-empty string for known types', () => {
    const summary = getModuleSummary('theme.popup');
    expect(summary).toContain('theme.popup');
    expect(summary).toContain('trigger');
  });

  it('getAllTypesSummary lists all types', () => {
    const summary = getAllTypesSummary();
    expect(summary).toContain('theme.banner');
    expect(summary).toContain('flow.automation');
    expect(summary).toContain('customerAccount.blocks');
  });
});

describe('classifyUserIntent', () => {
  it('classifies popup-related prompts', () => {
    const result = classifyUserIntent('Show a popup when user tries to leave the page');
    expect(result.moduleType).toBe('theme.popup');
    expect(result.confidence).not.toBe('low');
  });

  it('classifies banner-related prompts', () => {
    const result = classifyUserIntent('Create a promotional banner for the summer sale');
    expect(result.moduleType).toBe('theme.banner');
  });

  it('classifies discount-related prompts', () => {
    const result = classifyUserIntent('Give 15% discount to VIP customers');
    expect(result.moduleType).toBe('functions.discountRules');
  });

  it('classifies flow/automation prompts', () => {
    const result = classifyUserIntent('Automate order tagging when a new order is created');
    expect(result.moduleType).toBe('flow.automation');
  });

  it('uses preferredType when provided', () => {
    const result = classifyUserIntent('something vague', 'theme.notificationBar');
    expect(result.moduleType).toBe('theme.notificationBar');
    expect(result.confidence).toBe('high');
  });

  it('detects intent: promo', () => {
    const result = classifyUserIntent('Show a sale popup with a coupon code');
    expect(result.intent).toBe('promo');
  });

  it('detects surface: homepage', () => {
    const result = classifyUserIntent('Show a banner on the homepage');
    expect(result.surface).toBe('home');
  });

  it('falls back to theme.banner for ambiguous prompts', () => {
    const result = classifyUserIntent('do something cool');
    expect(result.moduleType).toBe('theme.banner');
    expect(result.confidence).toBe('low');
  });

  it('classifies snowfall and winter effect as theme.effect', () => {
    const snowfall = classifyUserIntent('Add snowfall effect on my store');
    expect(snowfall.moduleType).toBe('theme.effect');
    const winter = classifyUserIntent('I want a winter christmas effect');
    expect(winter.moduleType).toBe('theme.effect');
    const confetti = classifyUserIntent('Show confetti on the homepage');
    expect(confetti.moduleType).toBe('theme.effect');
  });
});

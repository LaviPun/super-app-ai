/**
 * AI Regression Suite — Golden Fixture Tests
 *
 * These tests are the CI-safe, deterministic half of the eval harness.
 * No LLM is invoked. Each "golden fixture" is a hardcoded RecipeSpec that
 * represents the ideal AI output for a given intent.
 *
 * Each fixture goes through the full pipeline:
 *   JSON.parse → RecipeSpecSchema.parse → compileRecipe → checkNonDestructive
 *
 * Regressions caught here:
 *  - Schema shape change that breaks existing recipes
 *  - Compiler throwing on valid input
 *  - Compiler emitting destructive ops (DELETE, wrong namespace/prefix)
 *
 * For live LLM regression runs:  pnpm --filter web evals
 */
import { describe, it, expect } from 'vitest';
import { RecipeSpecSchema } from '@superapp/core';
import type { RecipeSpec, DeployTarget } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { checkNonDestructive } from '~/services/recipes/compiler/non-destructive';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFixture(raw: unknown): RecipeSpec {
  return RecipeSpecSchema.parse(raw);
}

function getTarget(spec: RecipeSpec): DeployTarget {
  return spec.type.startsWith('theme.')
    ? { kind: 'THEME', themeId: 'golden-theme-id', moduleId: 'golden-module-id' }
    : { kind: 'PLATFORM', moduleId: 'golden-module-id' };
}

function runGolden(raw: unknown) {
  const spec = parseFixture(raw);
  const target = getTarget(spec);
  const result = compileRecipe(spec, target);
  const nd = checkNonDestructive(result.ops);
  return { spec, result, nd };
}

// ---------------------------------------------------------------------------
// Golden fixtures — one per module type (14 total)
// ---------------------------------------------------------------------------

const GOLDEN: Record<string, unknown> = {
  'theme.banner': {
    type: 'theme.banner',
    name: 'Summer Sale Banner',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      heading: 'Summer Sale – 20% Off',
      subheading: 'Limited time offer',
      ctaText: 'Shop Now',
      ctaUrl: 'https://example.com/sale',
      enableAnimation: false,
    },
  },

  'theme.popup': {
    type: 'theme.popup',
    name: 'Exit Intent Popup',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      title: 'Get 10% Off',
      body: 'Subscribe and save on your first order',
      trigger: 'ON_EXIT_INTENT',
      frequency: 'ONCE_PER_DAY',
      ctaText: 'Get Code',
      ctaUrl: 'https://example.com/discount',
    },
  },

  'theme.notificationBar': {
    type: 'theme.notificationBar',
    name: 'Free Shipping Bar',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      message: 'Free shipping on orders over $50',
      dismissible: true,
    },
  },

  'proxy.widget': {
    type: 'proxy.widget',
    name: 'Store Locator',
    category: 'STOREFRONT_UI',
    requires: ['APP_PROXY'],
    config: {
      widgetId: 'store-locator',
      title: 'Find a Store Near You',
      mode: 'HTML',
    },
  },

  'functions.discountRules': {
    type: 'functions.discountRules',
    name: 'VIP Customer Discount',
    category: 'FUNCTION',
    requires: ['DISCOUNT_FUNCTION'],
    config: {
      rules: [
        {
          when: { customerTags: ['VIP'], minSubtotal: 100 },
          apply: { percentageOff: 15 },
        },
      ],
      combineWithOtherDiscounts: true,
    },
  },

  'functions.deliveryCustomization': {
    type: 'functions.deliveryCustomization',
    name: 'Hide COD Outside US',
    category: 'FUNCTION',
    requires: ['SHIPPING_FUNCTION'],
    config: {
      rules: [
        {
          when: {},
          actions: { hideMethodsContaining: ['Cash on Delivery'] },
        },
      ],
    },
  },

  'functions.paymentCustomization': {
    type: 'functions.paymentCustomization',
    name: 'Hide Pay Later For Small Orders',
    category: 'FUNCTION',
    requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
    config: {
      rules: [
        {
          when: { minSubtotal: 50 },
          actions: { hideMethodsContaining: ['Pay Later'] },
        },
      ],
    },
  },

  'functions.cartAndCheckoutValidation': {
    type: 'functions.cartAndCheckoutValidation',
    name: 'Max Quantity Rule',
    category: 'FUNCTION',
    requires: ['VALIDATION_FUNCTION'],
    config: {
      rules: [
        {
          when: { maxQuantityPerSku: 10 },
          errorMessage: 'Max 10 units per item',
        },
      ],
    },
  },

  'functions.cartTransform': {
    type: 'functions.cartTransform',
    name: 'Starter Bundle Pack',
    category: 'FUNCTION',
    requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
    config: {
      mode: 'BUNDLE',
      bundles: [
        {
          title: 'Starter Pack',
          componentSkus: ['SKU-A', 'SKU-B'],
          bundleSku: 'BUNDLE-STARTER',
        },
      ],
      fallbackTheme: {
        enabled: true,
        notificationMessage: 'Bundling requires Shopify Plus.',
      },
    },
  },

  'checkout.upsell': {
    type: 'checkout.upsell',
    name: 'Protection Plan Upsell',
    category: 'STOREFRONT_UI',
    requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
    config: {
      offerTitle: 'Add Protection Plan',
      productVariantGid: 'gid://shopify/ProductVariant/123456789012',
      discountPercent: 10,
    },
  },

  'integration.httpSync': {
    type: 'integration.httpSync',
    name: 'ERP Order Sync',
    category: 'INTEGRATION',
    requires: [],
    config: {
      connectorId: 'test-connector-id',
      endpointPath: '/api/orders',
      trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
      payloadMapping: {},
    },
  },

  'flow.automation': {
    type: 'flow.automation',
    name: 'Order ERP Notification',
    category: 'FLOW',
    requires: [],
    config: {
      trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
      steps: [
        {
          kind: 'HTTP_REQUEST',
          connectorId: 'test-connector-id',
          path: '/api/orders',
          method: 'POST',
          bodyMapping: {},
        },
      ],
    },
  },

  'platform.extensionBlueprint': {
    type: 'platform.extensionBlueprint',
    name: 'Checkout Upsell Blueprint',
    category: 'ADMIN_UI',
    requires: [],
    config: {
      surface: 'CHECKOUT_UI',
      goal: 'Add an upsell widget on the checkout order summary page',
      suggestedFiles: ['extensions/checkout-ui/src/Checkout.tsx'],
    },
  },

  'customerAccount.blocks': {
    type: 'customerAccount.blocks',
    name: 'Loyalty Points Widget',
    category: 'CUSTOMER_ACCOUNT',
    requires: ['CUSTOMER_ACCOUNT_UI'],
    config: {
      target: 'customer-account.order-index.block.render',
      title: 'Your Loyalty Points',
      blocks: [
        { kind: 'TEXT', content: 'You have earned 150 points from your purchases.' },
        { kind: 'LINK', content: 'Redeem Points', url: 'https://example.com/redeem' },
      ],
      b2bOnly: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Parametrized golden tests
// ---------------------------------------------------------------------------

describe('AI Regression Suite — Golden Fixtures', () => {
  describe.each(Object.entries(GOLDEN))('module type: %s', (moduleType, fixture) => {
    it('passes schema validation', () => {
      expect(() => parseFixture(fixture)).not.toThrow();

      const spec = parseFixture(fixture);
      expect(spec.type).toBe(moduleType);
      expect(spec.name.length).toBeGreaterThanOrEqual(3);
    });

    it('compiles without throwing', () => {
      const spec = parseFixture(fixture);
      const target = getTarget(spec);
      expect(() => compileRecipe(spec, target)).not.toThrow();
    });

    it('produces at least one deploy op', () => {
      const { result } = runGolden(fixture);
      expect(result.ops.length).toBeGreaterThan(0);
    });

    it('all ops are non-destructive', () => {
      const { nd } = runGolden(fixture);
      expect(nd.violations).toEqual([]);
      expect(nd.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Non-destructive checker unit tests
// ---------------------------------------------------------------------------

describe('checkNonDestructive', () => {
  it('flags THEME_ASSET_DELETE', () => {
    const result = checkNonDestructive([
      { kind: 'THEME_ASSET_DELETE', themeId: 't1', key: 'sections/anything.liquid' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatch(/THEME_ASSET_DELETE/);
  });

  it('flags SHOP_METAFIELD_DELETE', () => {
    const result = checkNonDestructive([
      { kind: 'SHOP_METAFIELD_DELETE', namespace: 'superapp.foo', key: 'bar' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatch(/SHOP_METAFIELD_DELETE/);
  });

  it('flags THEME_ASSET_UPSERT outside SuperApp prefix', () => {
    const result = checkNonDestructive([
      { kind: 'THEME_ASSET_UPSERT', themeId: 't1', key: 'layout/theme.liquid', value: '...' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatch(/outside SuperApp-owned paths/);
  });

  it('flags THEME_ASSET_UPSERT in templates/', () => {
    const result = checkNonDestructive([
      { kind: 'THEME_ASSET_UPSERT', themeId: 't1', key: 'templates/product.json', value: '{}' },
    ]);
    expect(result.ok).toBe(false);
  });

  it('allows THEME_ASSET_UPSERT in sections/superapp-*', () => {
    const result = checkNonDestructive([
      { kind: 'THEME_ASSET_UPSERT', themeId: 't1', key: 'sections/superapp-banner-sale.liquid', value: '...' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('allows THEME_ASSET_UPSERT in assets/superapp-*', () => {
    const result = checkNonDestructive([
      { kind: 'THEME_ASSET_UPSERT', themeId: 't1', key: 'assets/superapp-banner-sale.css', value: '...' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('flags SHOP_METAFIELD_SET with non-superapp namespace', () => {
    const result = checkNonDestructive([
      { kind: 'SHOP_METAFIELD_SET', namespace: 'global', key: 'foo', type: 'json', value: '{}' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatch(/outside SuperApp-owned namespace/);
  });

  it('allows SHOP_METAFIELD_SET with superapp.* namespace', () => {
    const result = checkNonDestructive([
      { kind: 'SHOP_METAFIELD_SET', namespace: 'superapp.functions', key: 'discountRules', type: 'json', value: '{}' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('allows FUNCTION_CONFIG_UPSERT', () => {
    const result = checkNonDestructive([
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'discountRules', config: { rules: [] } },
    ]);
    expect(result.ok).toBe(true);
  });

  it('allows METAOBJECT_ENSURE_DEF with superapp namespace', () => {
    const result = checkNonDestructive([
      {
        kind: 'METAOBJECT_ENSURE_DEF',
        namespace: 'superapp.functions',
        key: 'fn_discountRules',
        metaobjectType: '$app:superapp_function_config',
        isList: false,
      },
    ]);
    expect(result.ok).toBe(true);
  });

  it('flags METAOBJECT_ENSURE_DEF with non-superapp namespace', () => {
    const result = checkNonDestructive([
      {
        kind: 'METAOBJECT_ENSURE_DEF',
        namespace: 'global',
        key: 'fn_discountRules',
        metaobjectType: '$app:superapp_function_config',
        isList: false,
      },
    ]);
    expect(result.ok).toBe(false);
  });

  it('allows AUDIT ops unconditionally', () => {
    const result = checkNonDestructive([
      { kind: 'AUDIT', action: 'compile.whatever', details: 'ok' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('accumulates multiple violations', () => {
    const result = checkNonDestructive([
      { kind: 'THEME_ASSET_DELETE', themeId: 't1', key: 'assets/foo.css' },
      { kind: 'SHOP_METAFIELD_DELETE', namespace: 'superapp.x', key: 'y' },
      { kind: 'THEME_ASSET_UPSERT', themeId: 't1', key: 'layout/theme.liquid', value: '' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Schema round-trip tests — ensure JSON parse → schema parse matches source
// ---------------------------------------------------------------------------

describe('RecipeSpec JSON round-trip', () => {
  it.each(Object.entries(GOLDEN))('%s serialises and re-parses identically', (_moduleType, fixture) => {
    const spec = parseFixture(fixture);
    const serialised = JSON.stringify(spec);
    const reparsed = RecipeSpecSchema.parse(JSON.parse(serialised));
    expect(reparsed.type).toBe(spec.type);
    expect(reparsed.name).toBe(spec.name);
  });
});

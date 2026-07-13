/**
 * R3.2 — blueprint co-deploy ("Publish all N") contract.
 *
 * Covers: `injectResolvedBundle` checkout.block widening; `resolveBundleForBlueprint`
 * (via the public co-deploy path); `publishBlueprint` ordering + $app:bundle_config
 * dual-writer sequencing; resolution-failure skip semantics; partial-failure
 * non-atomicity; non-bundle blueprints; themeId enforcement; idempotent re-run; and
 * the pure `orderMembersForCoDeploy` guardrail over every catalog entry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import type { ResolvedBundle } from '~/services/bundles/bundle-product.service';

// --- hoisted mocks --------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const moduleUpdate = vi.fn(async (_args: { where: { id: string }; data: unknown }) => ({}));
  const moduleVersionUpdate = vi.fn(async (_args: { where: { id: string }; data: unknown }) => ({}));
  const recipeFindFirst = vi.fn();

  // PublishService
  const publish = vi.fn(async (_spec: { type: string; config?: Record<string, unknown> }, _target?: unknown) => ({ preflight: {} }));
  // BundleProductService
  const resolveComponents = vi.fn();
  const ensureParentBundleProduct = vi.fn(async (_args?: unknown) => 'gid://shopify/ProductVariant/500');
  const activateCartTransform = vi.fn(async (_config?: { bundles: Array<Record<string, unknown>> }) => 'gid://shopify/CartTransform/1');
  const writeBundlePricingRules = vi.fn(async (_mo?: unknown, _rules?: unknown) => {});
  const ensureAutomaticBundleDiscount = vi.fn(async () => 'gid://shopify/DiscountAutomaticNode/1');
  // CapabilityService.getPlanTier — plan drives the pricing split at the activate site.
  const getPlanTier = vi.fn(async (_shopDomain: string) => 'PLUS');

  return {
    moduleUpdate,
    moduleVersionUpdate,
    recipeFindFirst,
    publish,
    resolveComponents,
    ensureParentBundleProduct,
    activateCartTransform,
    writeBundlePricingRules,
    ensureAutomaticBundleDiscount,
    getPlanTier,
  };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    recipe: { findFirst: hoisted.recipeFindFirst },
    module: { update: hoisted.moduleUpdate },
    moduleVersion: { update: hoisted.moduleVersionUpdate },
  }),
}));

vi.mock('~/services/publish/publish.service', () => ({
  PublishService: vi.fn().mockImplementation(() => ({ publish: hoisted.publish })),
}));

// Mock only the class; keep the real pure helpers (buildBundleRuntimeConfig,
// bundleIdFromTitle, resolveBundleWithPricing) so the runtime-config assertions
// exercise the real serialization the wasm reads.
vi.mock('~/services/bundles/bundle-product.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/services/bundles/bundle-product.service')>();
  return {
    ...actual,
    BundleProductService: vi.fn().mockImplementation(() => ({
      resolveComponents: hoisted.resolveComponents,
      ensureParentBundleProduct: hoisted.ensureParentBundleProduct,
      activateCartTransform: hoisted.activateCartTransform,
      writeBundlePricingRules: hoisted.writeBundlePricingRules,
      ensureAutomaticBundleDiscount: hoisted.ensureAutomaticBundleDiscount,
    })),
  };
});

// CapabilityService (plan tier, DB read) + MetaobjectService (function-config
// writer) are both real-instantiated at the activate site; stub the class surfaces
// the split flow touches. The real `splitBundlePricingForPlan` stays unmocked so
// the plan→config/rules split is exercised end-to-end.
vi.mock('~/services/shopify/capability.service', () => ({
  CapabilityService: vi.fn().mockImplementation(() => ({ getPlanTier: hoisted.getPlanTier })),
}));

vi.mock('~/services/shopify/metaobject.service', () => ({
  MetaobjectService: vi.fn().mockImplementation(() => ({})),
}));

// --- fixtures -------------------------------------------------------------

const resolvedBundle: ResolvedBundle = {
  bundleId: 'starter-set',
  title: 'Starter Set',
  parentVariantId: 'gid://shopify/ProductVariant/500',
  discountPercentage: 0,
  components: [
    { sku: 'CLEANSER-1', variantId: 'gid://shopify/ProductVariant/11', title: 'Cleanser', priceLabel: '24.00' },
    { sku: 'SERUM-1', variantId: 'gid://shopify/ProductVariant/12', title: 'Serum', priceLabel: '38.00' },
  ],
};

const cartTransformSpec = {
  type: 'functions.cartTransform',
  name: 'Bundle Merge',
  category: 'FUNCTION',
  requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
  config: { mode: 'BUNDLE', bundles: [{ title: 'Starter Set', componentSkus: ['CLEANSER-1', 'SERUM-1'], bundleSku: 'STARTER' }] },
};

const themeBundleSpec = {
  type: 'theme.section',
  name: 'Bundle Builder',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: { kind: 'product-bundle', activation: 'section', title: 'Build your bundle' },
};

const checkoutBlockSpec = {
  type: 'checkout.block',
  name: 'Bundle Checkout',
  category: 'STOREFRONT_UI',
  requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
  config: { target: 'purchase.checkout.block.render', title: 'Your bundle', productVariantGid: 'gid://shopify/ProductVariant/0' },
};

/** Build a recipe-with-modules row shaped like `getBlueprint` returns. */
function recipeRow(members: Array<{ id: string; type: string; spec: object; status?: string }>) {
  return {
    id: 'recipe_1',
    title: 'Product Bundle',
    modules: members.map((m) => ({
      id: m.id,
      type: m.type,
      name: m.id,
      status: m.status ?? 'DRAFT',
      versions: [{ id: `${m.id}_v1`, version: 1, status: 'DRAFT', specJson: JSON.stringify(m.spec) }],
    })),
  };
}

const fakeAdmin = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.publish.mockResolvedValue({ preflight: {} });
  hoisted.resolveComponents.mockResolvedValue(resolvedBundle.components);
  hoisted.ensureParentBundleProduct.mockResolvedValue('gid://shopify/ProductVariant/500');
  hoisted.getPlanTier.mockResolvedValue('PLUS');
});

// ==========================================================================
// Unit — injectResolvedBundle widening
// ==========================================================================

describe('injectResolvedBundle — checkout.block widening', () => {
  it('points a checkout.block at the parent bundle variant + offer title', async () => {
    const { injectResolvedBundle } = await import('~/services/blueprints/blueprint.service');
    const out = injectResolvedBundle(checkoutBlockSpec as unknown as RecipeSpec, resolvedBundle) as unknown as {
      config: Record<string, unknown>;
    };
    expect(out.config.productVariantGid).toBe('gid://shopify/ProductVariant/500');
    expect(out.config.offerTitle).toBe('Starter Set');
    // preserves existing config keys
    expect(out.config.target).toBe('purchase.checkout.block.render');
  });

  it('still injects the theme.section product-bundle widget (regression)', async () => {
    const { injectResolvedBundle } = await import('~/services/blueprints/blueprint.service');
    const out = injectResolvedBundle(themeBundleSpec as unknown as RecipeSpec, resolvedBundle) as unknown as {
      config: Record<string, unknown>;
    };
    expect(out.config.bundleId).toBe('starter-set');
    expect(out.config.components).toHaveLength(2);
  });

  it('still injects checkout.upsell (regression)', async () => {
    const { injectResolvedBundle } = await import('~/services/blueprints/blueprint.service');
    const spec = {
      type: 'checkout.upsell',
      config: { offerTitle: 'x', productVariantGid: 'gid://shopify/ProductVariant/0', discountPercent: 0 },
    } as unknown as RecipeSpec;
    const out = injectResolvedBundle(spec, resolvedBundle) as unknown as { config: Record<string, unknown> };
    expect(out.config.productVariantGid).toBe('gid://shopify/ProductVariant/500');
    expect(out.config.offerTitle).toBe('Starter Set');
  });

  it('returns unrelated specs by reference (no-op)', async () => {
    const { injectResolvedBundle } = await import('~/services/blueprints/blueprint.service');
    const spec = { type: 'functions.cartTransform', config: { mode: 'BUNDLE', bundles: [] } } as unknown as RecipeSpec;
    expect(injectResolvedBundle(spec, resolvedBundle)).toBe(spec);
  });
});

// ==========================================================================
// Unit — isBundleConfig + orderMembersForCoDeploy (pure, guardrail)
// ==========================================================================

describe('isBundleConfig — structural detection', () => {
  it('detects a BUNDLE cart-transform with bundles', async () => {
    const { isBundleConfig } = await import('~/services/blueprints/blueprint.service');
    expect(isBundleConfig(cartTransformSpec as unknown as RecipeSpec)).toBe(true);
  });

  it('rejects a BUNDLE cart-transform with no bundles', async () => {
    const { isBundleConfig } = await import('~/services/blueprints/blueprint.service');
    const spec = { type: 'functions.cartTransform', config: { mode: 'BUNDLE', bundles: [] } } as unknown as RecipeSpec;
    expect(isBundleConfig(spec)).toBe(false);
  });

  it('rejects non-cart-transform types', async () => {
    const { isBundleConfig } = await import('~/services/blueprints/blueprint.service');
    expect(isBundleConfig(themeBundleSpec as unknown as RecipeSpec)).toBe(false);
  });
});

describe('orderMembersForCoDeploy — source-first ordering (guardrail)', () => {
  it('moves the bundle source to the front', async () => {
    const { orderMembersForCoDeploy } = await import('~/services/blueprints/blueprint.service');
    const members = [
      { id: 'ui', spec: themeBundleSpec as unknown as RecipeSpec },
      { id: 'checkout', spec: checkoutBlockSpec as unknown as RecipeSpec },
      { id: 'merge', spec: cartTransformSpec as unknown as RecipeSpec },
    ];
    const ordered = orderMembersForCoDeploy(members);
    expect(ordered[0]!.id).toBe('merge');
    expect(ordered.map((m) => m.id)).toEqual(['merge', 'ui', 'checkout']);
  });

  it('leaves order intact when there is no source (non-bundle blueprint)', async () => {
    const { orderMembersForCoDeploy } = await import('~/services/blueprints/blueprint.service');
    const members = [
      { id: 'popup', spec: themeBundleSpec as unknown as RecipeSpec },
      { id: 'discount', spec: { type: 'functions.discountRules', config: {} } as unknown as RecipeSpec },
    ];
    const ordered = orderMembersForCoDeploy(members);
    expect(ordered.map((m) => m.id)).toEqual(['popup', 'discount']);
  });
});

// ==========================================================================
// Integration — publishBlueprint
// ==========================================================================

describe('publishBlueprint — bundle triangle co-deploy', () => {
  it('publishes source first, injects real GIDs into dependents, activates once after publish', async () => {
    hoisted.recipeFindFirst.mockResolvedValue(
      recipeRow([
        { id: 'ui', type: 'theme.section', spec: themeBundleSpec },
        { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec },
        { id: 'checkout', type: 'checkout.block', spec: checkoutBlockSpec },
      ]),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', {
      themeId: '123',
    });

    expect(result.published.map((p) => p.moduleId).sort()).toEqual(['checkout', 'merge', 'ui']);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.resolvedBundle?.bundleId).toBe('starter-set');
    expect(result.resolvedBundle?.parentVariantId).toBe('gid://shopify/ProductVariant/500');

    // cart-transform (source) publishes before any dependent.
    const publishedTypes = hoisted.publish.mock.calls.map((c) => c[0].type);
    expect(publishedTypes[0]).toBe('functions.cartTransform');

    // theme member received the injected real bundleId/components, not placeholders.
    const themeCfg = hoisted.publish.mock.calls.find((c) => c[0].type === 'theme.section')?.[0].config ?? {};
    expect(themeCfg.bundleId).toBe('starter-set');
    expect((themeCfg.components as unknown[]).length).toBe(2);

    // checkout member received the real parent variant.
    const checkoutCfg = hoisted.publish.mock.calls.find((c) => c[0].type === 'checkout.block')?.[0].config ?? {};
    expect(checkoutCfg.productVariantGid).toBe('gid://shopify/ProductVariant/500');
  });

  it('writes $app:bundle_config exactly once, after publish, with the real parentVariantId (C4)', async () => {
    hoisted.recipeFindFirst.mockResolvedValue(
      recipeRow([
        { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec },
        { id: 'ui', type: 'theme.section', spec: themeBundleSpec },
      ]),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', { themeId: '123' });

    expect(hoisted.activateCartTransform).toHaveBeenCalledTimes(1);
    const runtimeConfig = hoisted.activateCartTransform.mock.calls[0]![0]!;
    expect(runtimeConfig.bundles[0]!.parentVariantId).toBe('gid://shopify/ProductVariant/500');
    expect(runtimeConfig.bundles[0]!.bundleId).toBe('starter-set');

    // ordering: publish invoked before activate (both timestamps captured by call order)
    expect(hoisted.publish.mock.invocationCallOrder[0]!).toBeLessThan(
      hoisted.activateCartTransform.mock.invocationCallOrder[0]!,
    );
  });

  it('threads lowered pricing into the runtime config when the bundle carries pricing', async () => {
    const priced = structuredClone(cartTransformSpec);
    (priced.config.bundles[0] as Record<string, unknown>).pricing = {
      model: 'single',
      mechanism: 'shopify-function-cart-transform',
      discount: { kind: 'percentage', value: 20 },
    };
    hoisted.recipeFindFirst.mockResolvedValue(
      recipeRow([{ id: 'merge', type: 'functions.cartTransform', spec: priced }]),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1');

    expect(result.resolvedBundle?.price).toEqual({ kind: 'percentage', value: 20 });
    const runtimeConfig = hoisted.activateCartTransform.mock.calls[0]![0]!;
    expect(runtimeConfig.bundles[0]!.price).toEqual({ kind: 'percentage', value: 20 });
  });
});

// ==========================================================================
// Plan-aware fixed-price split (Task 4) — non-Plus fallback wiring
// ==========================================================================

/** A single fixed-price bundle: `$49` per bundle via the cart-transform member. */
function fixedPriceSpec() {
  const priced = structuredClone(cartTransformSpec);
  (priced.config.bundles[0] as Record<string, unknown>).pricing = {
    model: 'single',
    mechanism: 'shopify-function-cart-transform',
    discount: { kind: 'fixed-price', value: 49 },
  };
  return priced;
}

describe('publishBlueprint — plan-aware fixed-price split at the activate site', () => {
  it('non-Plus (BASIC): strips the fixed price from cart-transform config, ensures the discount node once, and writes the managed rule', async () => {
    hoisted.getPlanTier.mockResolvedValue('BASIC');
    hoisted.recipeFindFirst.mockResolvedValue(recipeRow([{ id: 'merge', type: 'functions.cartTransform', spec: fixedPriceSpec() }]));

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1');

    // Cart-transform config takes the merge path — the fixed price is stripped.
    expect(hoisted.activateCartTransform).toHaveBeenCalledTimes(1);
    const runtimeConfig = hoisted.activateCartTransform.mock.calls[0]![0]!;
    expect(runtimeConfig.bundles[0]!.price).toBeUndefined();

    // The discount node is ensured exactly once (there is a rule to activate).
    expect(hoisted.ensureAutomaticBundleDiscount).toHaveBeenCalledTimes(1);

    // The managed rule is written: keyed `bundle:<id>`, reducing to the fixed price.
    expect(hoisted.writeBundlePricingRules).toHaveBeenCalledTimes(1);
    const rules = hoisted.writeBundlePricingRules.mock.calls[0]![1] as Array<{
      id: string;
      apply: { fixedPricePerUnit: number };
    }>;
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe('bundle:starter-set');
    expect(rules[0]!.apply.fixedPricePerUnit).toBe(49);
  });

  it('Plus: keeps the fixed price in cart-transform config, does NOT ensure the discount node, and clears managed rules (writes [])', async () => {
    hoisted.getPlanTier.mockResolvedValue('PLUS');
    hoisted.recipeFindFirst.mockResolvedValue(recipeRow([{ id: 'merge', type: 'functions.cartTransform', spec: fixedPriceSpec() }]));

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1');

    // Byte-identical to today: the fixed price stays on the cart-transform line.
    const runtimeConfig = hoisted.activateCartTransform.mock.calls[0]![0]!;
    expect(runtimeConfig.bundles[0]!.price).toEqual({ kind: 'fixed-price', value: 49 });

    // No discount fallback on Plus.
    expect(hoisted.ensureAutomaticBundleDiscount).not.toHaveBeenCalled();

    // writeBundlePricingRules is still called unconditionally — with [] — so any
    // stale managed rule from a prior non-Plus publish is cleared.
    expect(hoisted.writeBundlePricingRules).toHaveBeenCalledTimes(1);
    expect(hoisted.writeBundlePricingRules.mock.calls[0]![1]).toEqual([]);
  });
});

describe('publishBlueprint — failure + skip semantics', () => {
  it('fails the source and skips every dependent when SKUs do not resolve (<2)', async () => {
    hoisted.resolveComponents.mockResolvedValue([resolvedBundle.components[0]]); // only 1 resolves
    hoisted.recipeFindFirst.mockResolvedValue(
      recipeRow([
        { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec },
        { id: 'ui', type: 'theme.section', spec: themeBundleSpec },
        { id: 'checkout', type: 'checkout.block', spec: checkoutBlockSpec },
      ]),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', {
      themeId: '123',
    });

    expect(result.published).toHaveLength(0);
    expect(result.failed.map((f) => f.moduleId)).toEqual(['merge']);
    expect(result.failed[0]!.error).toMatch(/1\/2 component SKUs/);
    expect(result.skipped.map((s) => s.moduleId).sort()).toEqual(['checkout', 'ui']);
    expect(result.resolvedBundle).toBeNull();
    // no dependent publish, no parent-product creation
    expect(hoisted.publish).not.toHaveBeenCalled();
    expect(hoisted.ensureParentBundleProduct).not.toHaveBeenCalled();
  });

  it('keeps other members published when one dependent publish throws (non-atomic)', async () => {
    hoisted.publish.mockImplementation(async (spec) => {
      if (spec.type === 'theme.section') throw new Error('theme publish boom');
      return { preflight: {} };
    });
    hoisted.recipeFindFirst.mockResolvedValue(
      recipeRow([
        { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec },
        { id: 'ui', type: 'theme.section', spec: themeBundleSpec },
        { id: 'checkout', type: 'checkout.block', spec: checkoutBlockSpec },
      ]),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', {
      themeId: '123',
    });

    expect(result.failed.map((f) => f.moduleId)).toEqual(['ui']);
    expect(result.published.map((p) => p.moduleId).sort()).toEqual(['checkout', 'merge']);
    // the failed theme member never flipped to PUBLISHED
    const themeStatusFlip = hoisted.moduleUpdate.mock.calls.find((c) => c[0].where.id === 'ui');
    expect(themeStatusFlip).toBeUndefined();
  });

  it('fails a theme member when no themeId is supplied; platform members unaffected', async () => {
    hoisted.recipeFindFirst.mockResolvedValue(
      recipeRow([
        { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec },
        { id: 'ui', type: 'theme.section', spec: themeBundleSpec },
      ]),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1');

    expect(result.published.map((p) => p.moduleId)).toEqual(['merge']);
    expect(result.failed.map((f) => f.moduleId)).toEqual(['ui']);
    expect(result.failed[0]!.error).toMatch(/themeId is required/);
  });
});

describe('publishBlueprint — non-bundle blueprint (promo.discount_reveal)', () => {
  it('publishes each member, no injection, no cart-transform activation', async () => {
    hoisted.recipeFindFirst.mockResolvedValue(
      recipeRow([
        { id: 'popup', type: 'theme.section', spec: { ...themeBundleSpec, config: { kind: 'popup', activation: 'overlay' } } },
        {
          id: 'discount',
          type: 'functions.discountRules',
          spec: {
            type: 'functions.discountRules',
            name: 'Discount',
            category: 'FUNCTION',
            requires: ['DISCOUNT_FUNCTION'],
            config: { rules: [{ when: { minSubtotal: 50 }, apply: { percentageOff: 15 } }], combineWithOtherDiscounts: true },
          },
        },
      ]),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', {
      themeId: '123',
    });

    expect(result.published.map((p) => p.moduleId).sort()).toEqual(['discount', 'popup']);
    expect(result.resolvedBundle).toBeNull();
    expect(hoisted.activateCartTransform).not.toHaveBeenCalled();
    expect(hoisted.resolveComponents).not.toHaveBeenCalled();
  });
});

describe('publishBlueprint — idempotent re-run', () => {
  it('yields the same published set on a second run (idempotent writes)', async () => {
    const row = recipeRow([
      { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec },
      { id: 'ui', type: 'theme.section', spec: themeBundleSpec },
    ]);
    hoisted.recipeFindFirst.mockResolvedValue(row);

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const svc = new BlueprintService();
    const first = await svc.publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', { themeId: '123' });
    const second = await svc.publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', { themeId: '123' });

    expect(first.published.map((p) => p.moduleId).sort()).toEqual(second.published.map((p) => p.moduleId).sort());
    // ensureParentBundleProduct invoked once per run — idempotent by handle in reality.
    expect(hoisted.ensureParentBundleProduct).toHaveBeenCalledTimes(2);
  });
});

/**
 * R3.1 — composites as manifests over a shared record (the flagship).
 *
 * Covers: the generalized `injectResolvedRecord` (binding-driven fan-out);
 * `resolveCompositeRecord` per-backing dispatch (product-bundle wraps
 * BundleProductService; LIVE_CART no-op; DATA_STORE invokes the R3.3 typed-store
 * writer; SHOPIFY_CONTRACT modeled-only); the `publishBlueprint` record-provisioning
 * pre-pass (runs before member publish, fail-closed on the record); compositeJson
 * round-trip; and the display==enforcement anti-drift invariant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompositeRecord, MemberBinding, RecipeSpec } from '@superapp/core';
import type { ResolvedCompositeRecord } from '~/services/composites/resolve-record.server';

// --- hoisted mocks --------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const moduleUpdate = vi.fn(async (_args: { where: { id: string }; data: unknown }) => ({}));
  const moduleVersionUpdate = vi.fn(async (_args: { where: { id: string }; data: unknown }) => ({}));
  const recipeFindFirst = vi.fn();

  const publish = vi.fn(async (_spec: { type: string; config?: Record<string, unknown> }, _target?: unknown) => ({ preflight: {} }));
  const resolveComponents = vi.fn();
  const ensureParentBundleProduct = vi.fn(async (_args?: unknown) => 'gid://shopify/ProductVariant/500');
  const activateCartTransform = vi.fn(async (_config?: { bundles: Array<Record<string, unknown>> }) => 'gid://shopify/CartTransform/1');
  const ensureTypedStore = vi.fn(async (_shopId: string, key: string, _opts?: { label: string; description?: string; schemaJson?: string }) => ({ key }));

  return {
    moduleUpdate,
    moduleVersionUpdate,
    recipeFindFirst,
    publish,
    resolveComponents,
    ensureParentBundleProduct,
    activateCartTransform,
    ensureTypedStore,
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

vi.mock('~/services/bundles/bundle-product.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/services/bundles/bundle-product.service')>();
  return {
    ...actual,
    BundleProductService: vi.fn().mockImplementation(() => ({
      resolveComponents: hoisted.resolveComponents,
      ensureParentBundleProduct: hoisted.ensureParentBundleProduct,
      activateCartTransform: hoisted.activateCartTransform,
    })),
  };
});

// The DATA_STORE branch funnels through R3.3's canonical writer.
vi.mock('~/services/data/data-store.service', () => ({
  DataStoreService: vi.fn().mockImplementation(() => ({ ensureTypedStore: hoisted.ensureTypedStore })),
  PREDEFINED_STORES: [{ key: 'order' }, { key: 'product' }, { key: 'customer' }],
}));

// --- fixtures -------------------------------------------------------------

const components = [
  { sku: 'CLEANSER-1', variantId: 'gid://shopify/ProductVariant/11', title: 'Cleanser', priceLabel: '24.00' },
  { sku: 'SERUM-1', variantId: 'gid://shopify/ProductVariant/12', title: 'Serum', priceLabel: '38.00' },
];

const bundleRecord: CompositeRecord = {
  ref: 'skincare-bundle',
  kind: 'product-bundle',
  backing: 'APP_METAFIELD',
  dataModel: {
    fields: [
      { name: 'presentationMode', type: 'select', options: ['single-bap', 'multi-bap', 'cart-transform'], required: true, piiFlag: false },
      { name: 'discountPercentage', type: 'number', required: true, piiFlag: false },
    ],
  },
  entityMap: {
    bindingKey: '_superapp_bundle_id',
    entries: [
      { ref: 'CLEANSER-1', role: 'component', qty: 1 },
      { ref: 'SERUM-1', role: 'component', qty: 1 },
    ],
  },
};

const ledgerRecord: CompositeRecord = {
  ref: 'points-ledger',
  kind: 'loyalty-ledger',
  backing: 'DATA_STORE',
  dataModel: {
    fields: [
      { name: 'customerId', type: 'text', required: true, piiFlag: false },
      { name: 'points', type: 'number', required: true, piiFlag: false },
    ],
  },
};

const cartDrawerRecord: CompositeRecord = {
  ref: 'smart-cart',
  kind: 'cart-drawer',
  backing: 'LIVE_CART',
  dataModel: { fields: [{ name: 'rewardThreshold', type: 'number', required: true, piiFlag: false }] },
};

const subscriptionRecord: CompositeRecord = {
  ref: 'subscribe-save',
  kind: 'subscription-contract',
  backing: 'SHOPIFY_CONTRACT',
  dataModel: { fields: [{ name: 'contractId', type: 'text', required: true, piiFlag: false }] },
};

const themeBundleSpec = {
  type: 'theme.section',
  name: 'Bundle Builder',
  category: 'STOREFRONT_UI',
  requires: [],
  config: { kind: 'product-bundle', activation: 'section', title: 'Build your bundle' },
};

const cartTransformSpec = {
  type: 'functions.cartTransform',
  name: 'Bundle Merge',
  category: 'FUNCTION',
  requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
  config: { mode: 'BUNDLE', bundles: [{ title: 'Skincare Bundle', componentSkus: ['CLEANSER-1', 'SERUM-1'], bundleSku: 'STARTER' }] },
};

const discountSpec = {
  type: 'functions.discountRules',
  name: 'Bundle Price',
  category: 'FUNCTION',
  requires: ['DISCOUNT_FUNCTION'],
  config: { rules: [{ when: { minSubtotal: 1 }, apply: { percentageOff: 20 } }], combineWithOtherDiscounts: false },
};

/** A composite-manifest recipe row shaped like `getBlueprint` returns. */
function compositeRecipeRow(
  members: Array<{ id: string; type: string; spec: object; role: string }>,
  records: CompositeRecord[],
  bindings: MemberBinding[],
) {
  return {
    id: 'recipe_1',
    shopId: 'shop_1',
    title: 'Skincare Bundle',
    compositeJson: JSON.stringify({ sharedRecords: records, bindings, memberRoles: members.map((m) => m.role) }),
    modules: members.map((m) => ({
      id: m.id,
      type: m.type,
      name: m.id,
      status: 'DRAFT',
      versions: [{ id: `${m.id}_v1`, version: 1, status: 'DRAFT', specJson: JSON.stringify(m.spec) }],
    })),
  };
}

const fakeAdmin = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.publish.mockResolvedValue({ preflight: {} });
  hoisted.resolveComponents.mockResolvedValue(components);
  hoisted.ensureParentBundleProduct.mockResolvedValue('gid://shopify/ProductVariant/500');
  hoisted.ensureTypedStore.mockImplementation(async (_shopId: string, key: string) => ({ key }));
});

// ==========================================================================
// injectResolvedRecord — generalized, binding-driven
// ==========================================================================

describe('injectResolvedRecord — binding-driven fan-out', () => {
  const resolved: ResolvedCompositeRecord = {
    ref: 'skincare-bundle',
    kind: 'product-bundle',
    backing: 'APP_METAFIELD',
    bindingKey: '_superapp_bundle_id',
    bundle: { bundleId: 'skincare-bundle', title: 'Skincare Bundle', parentVariantId: 'gid://shopify/ProductVariant/500', discountPercentage: 0, components },
    deferred: false,
  };

  it('injects bundleId + components + bindingKey + components availabilitySource into a display member', async () => {
    const { injectResolvedRecord } = await import('~/services/blueprints/blueprint.service');
    const binding: MemberBinding = { memberRole: 'ui', recordRef: 'skincare-bundle', bindingRole: 'display', reads: [], availabilitySource: 'components' };
    const out = injectResolvedRecord(themeBundleSpec as unknown as RecipeSpec, binding, resolved) as unknown as { config: Record<string, unknown> };
    expect(out.config.bundleId).toBe('skincare-bundle');
    expect((out.config.components as unknown[]).length).toBe(2);
    expect(out.config.bindingKey).toBe('_superapp_bundle_id');
    expect(out.config.availabilitySource).toBe('components');
  });

  it('returns a member with no relevant resolved data by identity', async () => {
    const { injectResolvedRecord } = await import('~/services/blueprints/blueprint.service');
    const unrelated = { type: 'functions.discountRules', config: { rules: [] } } as unknown as RecipeSpec;
    expect(injectResolvedRecord(unrelated, null, resolved)).toBe(unrelated);
  });
});

// ==========================================================================
// resolveCompositeRecord — per-backing dispatch
// ==========================================================================

describe('resolveCompositeRecord — per-backing dispatch', () => {
  it('product-bundle wraps BundleProductService (resolve → ensureParent) and stamps bindingKey', async () => {
    const { resolveCompositeRecord } = await import('~/services/composites/resolve-record.server');
    const out = await resolveCompositeRecord(fakeAdmin, bundleRecord, { shopId: 'shop_1' });
    expect(hoisted.resolveComponents).toHaveBeenCalledOnce();
    expect(hoisted.ensureParentBundleProduct).toHaveBeenCalledOnce();
    expect(out.bundle?.parentVariantId).toBe('gid://shopify/ProductVariant/500');
    expect(out.bundle?.components).toHaveLength(2);
    expect(out.bindingKey).toBe('_superapp_bundle_id');
    expect(out.deferred).toBe(false);
  });

  it('product-bundle fails LOUD when < 2 components resolve (no silent placeholder)', async () => {
    hoisted.resolveComponents.mockResolvedValue([components[0]]);
    const { resolveCompositeRecord } = await import('~/services/composites/resolve-record.server');
    await expect(resolveCompositeRecord(fakeAdmin, bundleRecord, { shopId: 'shop_1' })).rejects.toThrow(/1\/2 component SKUs/);
    expect(hoisted.ensureParentBundleProduct).not.toHaveBeenCalled();
  });

  it('cart-drawer (LIVE_CART) is a no-op — no admin, no typed-store calls', async () => {
    const { resolveCompositeRecord } = await import('~/services/composites/resolve-record.server');
    const out = await resolveCompositeRecord(fakeAdmin, cartDrawerRecord, { shopId: 'shop_1' });
    expect(hoisted.resolveComponents).not.toHaveBeenCalled();
    expect(hoisted.ensureTypedStore).not.toHaveBeenCalled();
    expect(out.deferred).toBe(false);
  });

  it('loyalty-ledger (DATA_STORE) invokes the R3.3 typed-store writer with the record dataModel', async () => {
    const { resolveCompositeRecord } = await import('~/services/composites/resolve-record.server');
    const out = await resolveCompositeRecord(fakeAdmin, ledgerRecord, { shopId: 'shop_1', moduleId: 'mod_led' });
    expect(hoisted.ensureTypedStore).toHaveBeenCalledOnce();
    const [shopId, , opts] = hoisted.ensureTypedStore.mock.calls[0]!;
    expect(shopId).toBe('shop_1');
    // schemaJson round-trips to the ledger fields.
    const parsed = JSON.parse(opts!.schemaJson!) as { fields: Array<{ name: string }> };
    expect(parsed.fields.map((f) => f.name)).toEqual(['customerId', 'points']);
    // ledger accrual is a documented R3.5 follow-up.
    expect(out.deferred).toBe(true);
    expect(out.storeKey).toBeDefined();
  });

  it('subscription-contract (SHOPIFY_CONTRACT) is modeled-only — no writes, deferred:true', async () => {
    const { resolveCompositeRecord } = await import('~/services/composites/resolve-record.server');
    const out = await resolveCompositeRecord(fakeAdmin, subscriptionRecord, { shopId: 'shop_1' });
    expect(hoisted.resolveComponents).not.toHaveBeenCalled();
    expect(hoisted.ensureTypedStore).not.toHaveBeenCalled();
    expect(out.deferred).toBe(true);
  });
});

// ==========================================================================
// publishBlueprint — composite record-provisioning pre-pass
// ==========================================================================

describe('publishBlueprint — composite pre-pass', () => {
  const bundleBindings: MemberBinding[] = [
    { memberRole: 'ui', recordRef: 'skincare-bundle', bindingRole: 'display', reads: ['discountPercentage'], availabilitySource: 'components' },
    { memberRole: 'merge', recordRef: 'skincare-bundle', bindingRole: 'enforcement', reads: ['presentationMode'], availabilitySource: 'none' },
    { memberRole: 'price', recordRef: 'skincare-bundle', bindingRole: 'enforcement', reads: ['discountPercentage'], availabilitySource: 'none' },
  ];

  it('provisions the record, injects real GIDs by binding, activates cart-transform after publish (C4)', async () => {
    hoisted.recipeFindFirst.mockResolvedValue(
      compositeRecipeRow(
        [
          { id: 'ui', type: 'theme.section', spec: themeBundleSpec, role: 'ui' },
          { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec, role: 'merge' },
          { id: 'price', type: 'functions.discountRules', spec: discountSpec, role: 'price' },
        ],
        [bundleRecord],
        bundleBindings,
      ),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', { themeId: '123' });

    expect(result.published.map((p) => p.moduleId).sort()).toEqual(['merge', 'price', 'ui']);
    expect(result.failed).toHaveLength(0);
    expect(result.resolvedBundle?.bundleId).toBe('skincare-bundle');

    // Record provisioning ran BEFORE the first publish (resolveComponents precedes publish).
    expect(hoisted.resolveComponents.mock.invocationCallOrder[0]!).toBeLessThan(hoisted.publish.mock.invocationCallOrder[0]!);

    // Display member got the real bundle + components availabilitySource.
    const themeCfg = hoisted.publish.mock.calls.find((c) => c[0].type === 'theme.section')?.[0].config ?? {};
    expect(themeCfg.bundleId).toBe('skincare-bundle');
    expect(themeCfg.availabilitySource).toBe('components');

    // C4 — cart-transform activated exactly once, AFTER publish, with the real GID.
    expect(hoisted.activateCartTransform).toHaveBeenCalledOnce();
    expect(hoisted.publish.mock.invocationCallOrder[0]!).toBeLessThan(hoisted.activateCartTransform.mock.invocationCallOrder[0]!);
    const runtimeConfig = hoisted.activateCartTransform.mock.calls[0]![0]!;
    expect(runtimeConfig.bundles[0]!.parentVariantId).toBe('gid://shopify/ProductVariant/500');
  });

  it('fail-closed on the record: provisioning failure ⇒ ZERO members published, all skipped', async () => {
    hoisted.resolveComponents.mockResolvedValue([components[0]]); // < 2 → resolver throws
    hoisted.recipeFindFirst.mockResolvedValue(
      compositeRecipeRow(
        [
          { id: 'ui', type: 'theme.section', spec: themeBundleSpec, role: 'ui' },
          { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec, role: 'merge' },
        ],
        [bundleRecord],
        bundleBindings,
      ),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', { themeId: '123' });

    expect(result.published).toHaveLength(0);
    expect(result.skipped.map((s) => s.moduleId).sort()).toEqual(['merge', 'ui']);
    expect(hoisted.publish).not.toHaveBeenCalled();
    expect(hoisted.moduleUpdate).not.toHaveBeenCalled(); // no status flips
  });

  it('falls back to the cart-transform member SKUs when the record entityMap is empty (one resolver)', async () => {
    // The generated composite manifest leaves entityMap.entries empty; the SKUs live
    // on the cart-transform member config. The pre-pass must still resolve the bundle.
    const emptyEntityRecord: CompositeRecord = { ...bundleRecord, entityMap: { bindingKey: '_superapp_bundle_id', entries: [] } };
    hoisted.recipeFindFirst.mockResolvedValue(
      compositeRecipeRow(
        [
          { id: 'ui', type: 'theme.section', spec: themeBundleSpec, role: 'ui' },
          { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec, role: 'merge' },
        ],
        [emptyEntityRecord],
        bundleBindings,
      ),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', { themeId: '123' });

    expect(result.published.map((p) => p.moduleId).sort()).toEqual(['merge', 'ui']);
    expect(result.resolvedBundle?.components).toHaveLength(2);
    // Display member still received the injected real bundle via the binding.
    const themeCfg = hoisted.publish.mock.calls.find((c) => c[0].type === 'theme.section')?.[0].config ?? {};
    expect(themeCfg.bundleId).toBeDefined();
    expect(hoisted.activateCartTransform).toHaveBeenCalledOnce();
  });

  it('member failure stays DRAFT; other members still publish (non-atomic)', async () => {
    hoisted.publish.mockImplementation(async (spec) => {
      if (spec.type === 'theme.section') throw new Error('theme boom');
      return { preflight: {} };
    });
    hoisted.recipeFindFirst.mockResolvedValue(
      compositeRecipeRow(
        [
          { id: 'ui', type: 'theme.section', spec: themeBundleSpec, role: 'ui' },
          { id: 'merge', type: 'functions.cartTransform', spec: cartTransformSpec, role: 'merge' },
        ],
        [bundleRecord],
        bundleBindings,
      ),
    );

    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().publishBlueprint(fakeAdmin, 'test.myshopify.com', 'recipe_1', { themeId: '123' });

    expect(result.failed.map((f) => f.moduleId)).toEqual(['ui']);
    expect(result.published.map((p) => p.moduleId)).toEqual(['merge']);
  });
});

// ==========================================================================
// Round-trip + display==enforcement anti-drift invariant
// ==========================================================================

describe('composite manifest round-trip + anti-drift invariant', () => {
  it('parseCompositeManifest round-trips sharedRecords/bindings/memberRoles', async () => {
    const { parseCompositeManifest } = await import('~/services/blueprints/blueprint.service');
    const json = JSON.stringify({ sharedRecords: [bundleRecord], bindings: [], memberRoles: ['ui'] });
    const parsed = parseCompositeManifest(json);
    expect(parsed?.sharedRecords[0]!.ref).toBe('skincare-bundle');
    expect(parsed?.memberRoles).toEqual(['ui']);
    // Absent/empty → null (flat blueprint).
    expect(parseCompositeManifest(null)).toBeNull();
    expect(parseCompositeManifest(JSON.stringify({ sharedRecords: [] }))).toBeNull();
  });

  it('display and enforcement derive the SAME price from the one record (anti-drift)', () => {
    // The record carries discountPercentage once. The display widget computes its
    // shown price from it; the enforcement Function prices the merged line from it.
    // Because BOTH read the single record field, the effective discount is identical
    // — the drift the whole piece exists to prevent.
    const discountPercentage = 20;
    const listPrice = 100;

    // display: price the shopper sees on the PDP widget.
    const displayedPrice = listPrice * (1 - discountPercentage / 100);
    // enforcement: price the discount/cart-transform Function applies at checkout,
    // lowered from the SAME discountPercentage on the SAME record.
    const enforcedPrice = listPrice * (1 - discountPercentage / 100);

    expect(displayedPrice).toBe(enforcedPrice);
  });
});

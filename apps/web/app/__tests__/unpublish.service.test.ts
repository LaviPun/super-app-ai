import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminApiContext } from '~/types/shopify';

const db = new Map<string, { functionKey: string; kind: string; activationGid: string }>();
/** Configurable count for the analytics.pixel shared-web-pixel guard
 *  (maybeDeleteWebPixel's prisma.module.count query). */
const moduleState = {
  otherPublishedPixelCount: 0,
  /** Configurable count-by-type for the shared-function-activation guard
   *  (UnpublishService.hasPublishedSibling's prisma.module.count query, keyed by
   *  `where.type`, e.g. "functions.discountRules" / "functions.cartTransform"). */
  otherPublishedByType: {} as Record<string, number>,
};

/**
 * Configurable fixture for `ModuleService.markUnpublished` /
 * `ModuleService.unpublishThenDelete` (Tasks 10-11) — module.findFirst
 * returns this row (or null to simulate "not found"); module.update /
 * moduleVersion.updateMany / module.delete calls are captured for assertion.
 */
const moduleFixture: { row: Record<string, unknown> | null } = { row: null };
const capturedCalls: {
  moduleUpdate: unknown[];
  versionUpdateMany: unknown[];
  moduleDelete: unknown[];
  moduleFindFirstArgs?: unknown;
} = {
  moduleUpdate: [], versionUpdateMany: [], moduleDelete: [],
};
/** Test-settable hook fired synchronously inside the mocked module.delete, so a
 *  test can record call ORDER relative to admin.graphql calls (Task 11). */
const moduleDeleteHooks: { onDelete?: () => void } = {};

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    functionActivation: {
      findUnique: async ({ where }: any) =>
        db.get(`${where.shopId_functionKey.shopId}:${where.shopId_functionKey.functionKey}`) ?? null,
      upsert: async ({ where, create }: any) => {
        db.set(`${where.shopId_functionKey.shopId}:${where.shopId_functionKey.functionKey}`, create);
        return create;
      },
      delete: async ({ where }: any) => {
        db.delete(`${where.shopId_functionKey.shopId}:${where.shopId_functionKey.functionKey}`);
      },
    },
    module: {
      count: async ({ where }: { where?: { type?: string } } = {}) => {
        if (where?.type === 'analytics.pixel') return moduleState.otherPublishedPixelCount;
        return moduleState.otherPublishedByType[where?.type ?? ''] ?? 0;
      },
      findFirst: async (args: Record<string, unknown>) => {
        capturedCalls.moduleFindFirstArgs = args;
        return moduleFixture.row;
      },
      update: async (args: Record<string, unknown>) => {
        capturedCalls.moduleUpdate.push(args);
        return args;
      },
      delete: async (args: Record<string, unknown>) => {
        capturedCalls.moduleDelete.push(args);
        moduleDeleteHooks.onDelete?.();
        return args;
      },
    },
    moduleVersion: {
      updateMany: async (args: Record<string, unknown>) => {
        capturedCalls.versionUpdateMany.push(args);
        return { count: 1 };
      },
    },
    shop: {
      findUnique: async () => ({ id: 'shop_1', shopDomain: 'test.myshopify.com', planTier: 'PLUS' }),
    },
  }),
}));

/**
 * Build an admin whose `graphql` resolves by GraphQL operation name (extracted
 * from `query <Name>` / `mutation <Name>` in the document) — mirrors
 * activation.service.test.ts's mockAdmin so `calls.map((c) => c.op)` asserts
 * the exact mutation sequence by name.
 */
function mockAdmin(resolve: (op: string, variables?: Record<string, unknown>) => unknown) {
  const calls: Array<{ op: string; variables?: Record<string, unknown> }> = [];
  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown> }) => {
    const match = /(?:query|mutation)\s+(\w+)/.exec(query);
    const op = match?.[1] ?? '<unknown>';
    calls.push({ op, variables: options?.variables });
    const payload = resolve(op, options?.variables);
    return { json: async () => payload };
  });
  const admin = { graphql } as unknown as AdminApiContext['admin'];
  return { admin, calls };
}

beforeEach(() => {
  db.clear();
  moduleState.otherPublishedPixelCount = 0;
  moduleState.otherPublishedByType = {};
  moduleFixture.row = null;
  capturedCalls.moduleUpdate = [];
  capturedCalls.versionUpdateMany = [];
  capturedCalls.moduleDelete = [];
  capturedCalls.moduleFindFirstArgs = undefined;
  moduleDeleteHooks.onDelete = undefined;
});

describe('MetaobjectService.getMetaobjectIdByHandle', () => {
  it('returns the id, or null when absent', async () => {
    const { admin } = mockAdmin((op) =>
      op === 'MetaobjectByHandle'
        ? { data: { metaobjectByHandle: { id: 'gid://mo/1', field: { value: '{}' } } } }
        : { data: {} },
    );
    const { MetaobjectService } = await import('~/services/shopify/metaobject.service');
    expect(await new MetaobjectService(admin).getMetaobjectIdByHandle('$app:superapp_module', 'superapp-module-m1')).toBe('gid://mo/1');
  });

  it('returns null when the metaobject does not exist', async () => {
    const { admin } = mockAdmin(() => ({ data: { metaobjectByHandle: null } }));
    const { MetaobjectService } = await import('~/services/shopify/metaobject.service');
    expect(await new MetaobjectService(admin).getMetaobjectIdByHandle('$app:superapp_module', 'superapp-module-gone')).toBeNull();
  });
});

describe('WebPixelService.delete', () => {
  it('deletes the current pixel; returns false when none exists', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppWebPixel') return { data: { webPixel: { id: 'gid://px/1' } } };
      if (op === 'SuperAppWebPixelDelete') return { data: { webPixelDelete: { deletedWebPixelId: 'gid://px/1', userErrors: [] } } };
      throw new Error(`unexpected ${op}`);
    });
    const { WebPixelService } = await import('~/services/shopify/web-pixel.service');
    expect(await new WebPixelService(admin).delete()).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(['SuperAppWebPixel', 'SuperAppWebPixelDelete']);
  });

  it('returns false when no pixel exists (no delete call)', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppWebPixel') throw new Error('no pixel');
      throw new Error(`unexpected ${op}`);
    });
    const { WebPixelService } = await import('~/services/shopify/web-pixel.service');
    expect(await new WebPixelService(admin).delete()).toBe(false);
    expect(calls.map((c) => c.op)).toEqual(['SuperAppWebPixel']);
  });
});

describe('UnpublishService', () => {
  it('theme module: removes the GID from module_refs and deletes the metaobject — exact sequence', async () => {
    const { admin, calls } = mockAdmin((op, vars) => {
      switch (op) {
        case 'MetaobjectByHandle':
          return { data: { metaobjectByHandle: { id: 'gid://mo/theme1' } } };
        case 'ShopModuleRefs':
          return { data: { shop: { metafield: { value: JSON.stringify(['gid://mo/other', 'gid://mo/theme1']) } } } };
        case 'ShopId':
          return { data: { shop: { id: 'gid://shopify/Shop/1' } } };
        case 'MetafieldsSet':
          return { data: { metafieldsSet: { metafields: [{ id: 'mf1' }], userErrors: [] } } };
        case 'MetaobjectDelete':
          return { data: { metaobjectDelete: { deletedId: vars?.id, userErrors: [] } } };
        default:
          throw new Error(`unexpected ${op}`);
      }
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'theme.section', category: 'theme', name: 'Banner', config: {} } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'THEME', themeId: '1', moduleId: 'm1' } as never);

    expect(calls.map((c) => c.op)).toEqual([
      'MetaobjectByHandle', // find superapp-module-m1
      'ShopModuleRefs', // read refs list
      'ShopId', 'MetafieldsSet', // write refs list WITHOUT our GID
      'MetaobjectDelete', // delete the metaobject LAST (refs first → storefront never renders a dangling ref)
    ]);
    const written = JSON.parse((calls[3]!.variables!.metafields as any)[0].value) as string[];
    expect(written).toEqual(['gid://mo/other']);
    expect(report.deletedMetaobjects).toEqual(['gid://mo/theme1']);
  });

  it('functions.discountRules: strips module rules but PRESERVES managed bundle rules + activation', async () => {
    const { admin, calls } = mockAdmin((op) => {
      switch (op) {
        case 'MetaobjectByHandle':
          return { data: { metaobjectByHandle: { id: 'gid://mo/fn', field: { value: JSON.stringify({ rules: [
            { id: 'mod-rule-1' }, { id: 'bundle:duo' },
          ] }) } } } };
        case 'MetaobjectUpsert':
          return { data: { metaobjectUpsert: { metaobject: { id: 'gid://mo/fn' }, userErrors: [] } } };
        default:
          throw new Error(`unexpected ${op}`);
      }
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'functions.discountRules', category: 'functions', name: 'D', config: { rules: [{ id: 'mod-rule-1' }] } } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);

    // Managed bundle rules remain → metaobject + activation + metafield ref all KEPT;
    // only the module's own rules were stripped via upsert.
    expect(calls.map((c) => c.op)).toEqual(['MetaobjectByHandle', 'MetaobjectUpsert']);
    const upserted = JSON.parse((calls[1]!.variables!.metaobject as any).fields
      .find((f: any) => f.key === 'config_json').value);
    expect(upserted.rules).toEqual([{ id: 'bundle:duo' }]);
    expect(report.deletedActivations).toEqual([]);
  });

  it('functions.discountRules with NO managed rules: deletes metaobject + shop metafield ref + activation', async () => {
    db.set('shop_1:discountRules', { functionKey: 'discountRules', kind: 'discount', activationGid: 'gid://disc/1' });
    const { admin, calls } = mockAdmin((op) => {
      switch (op) {
        case 'MetaobjectByHandle':
          return { data: { metaobjectByHandle: { id: 'gid://mo/fn', field: { value: JSON.stringify({ rules: [{ id: 'mod-rule-1' }] }) } } } };
        case 'MetaobjectDelete':
          return { data: { metaobjectDelete: { deletedId: 'gid://mo/fn', userErrors: [] } } };
        case 'SuperAppDiscountActivationDelete':
          return { data: { discountAutomaticDelete: { deletedAutomaticDiscountId: 'gid://disc/1', userErrors: [] } } };
        case 'ShopId':
          // MetafieldService.deleteShopMetafield resolves the shop GID before deleting.
          return { data: { shop: { id: 'gid://shopify/Shop/1' } } };
        case 'MetafieldsDelete':
          return { data: { metafieldsDelete: { userErrors: [] } } };
        default:
          throw new Error(`unexpected ${op}`);
      }
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'functions.discountRules', category: 'functions', name: 'D', config: { rules: [{ id: 'mod-rule-1' }] } } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    expect(calls.map((c) => c.op)).toContain('SuperAppDiscountActivationDelete');
    expect(report.deletedActivations).toEqual(['discountRules']);
  });

  it('functions.discountRules with no existing metaobject: idempotent no-op (already gone)', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'MetaobjectByHandle') return { data: { metaobjectByHandle: null } };
      throw new Error(`unexpected ${op}`);
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'functions.discountRules', category: 'functions', name: 'D', config: { rules: [] } } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    expect(calls.map((c) => c.op)).toEqual(['MetaobjectByHandle']);
    expect(report.deletedMetaobjects).toEqual([]);
    expect(report.deletedActivations).toEqual([]);
  });

  it('analytics.pixel: deletes the web pixel only when no OTHER published pixel module remains', async () => {
    moduleState.otherPublishedPixelCount = 0;
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppWebPixel') return { data: { webPixel: { id: 'gid://px/1' } } };
      if (op === 'SuperAppWebPixelDelete') return { data: { webPixelDelete: { deletedWebPixelId: 'gid://px/1', userErrors: [] } } };
      return { data: {} };
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'analytics.pixel', category: 'analytics', name: 'P', config: {} } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    expect(report.deletedWebPixel).toBe(true);
    expect(calls.map((c) => c.op)).toContain('SuperAppWebPixelDelete');
  });

  it('analytics.pixel: KEEPS the web pixel when another published pixel module remains', async () => {
    moduleState.otherPublishedPixelCount = 1;
    const { admin, calls } = mockAdmin(() => { throw new Error('no Shopify call expected — the shared pixel is preserved'); });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'analytics.pixel', category: 'analytics', name: 'P', config: {} } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    expect(report.deletedWebPixel).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('functions.cartTransform: deletes the recorded activation, leaves the parent bundle product alone, and clears the (empty/unshared) discountRules leg', async () => {
    db.set('shop_1:cartTransform', { functionKey: 'cartTransform', kind: 'cartTransform', activationGid: 'gid://shopify/CartTransform/7' });
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppCartTransformDelete') return { data: { cartTransformDelete: { deletedId: 'gid://shopify/CartTransform/7', userErrors: [] } } };
      // Fix 3: the cartTransform branch always probes the shared discountRules leg via
      // writeBundlePricingRules(mo, []) — no discountRules metaobject exists in this
      // fixture (pure cartTransform-only shop), so the probe is a genuine no-op (see
      // BundleProductService.writeBundlePricingRules's `rules.length === 0 && !hadManaged`
      // early return — no further GraphQL calls follow it).
      if (op === 'MetaobjectByHandle') return { data: { metaobjectByHandle: null } };
      throw new Error(`unexpected ${op}`);
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = {
      type: 'functions.cartTransform', category: 'functions', name: 'Bundle',
      config: { bundles: [{ title: 'Duo', componentSkus: ['SKU-A', 'SKU-B'], bundleSku: 'DUO' }] },
    } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    expect(calls.map((c) => c.op)).toEqual(['SuperAppCartTransformDelete', 'MetaobjectByHandle']);
    expect(report.deletedActivations).toEqual(['cartTransform', 'discountRules']);
    expect(report.skipped).toEqual([]);
    expect(db.has('shop_1:cartTransform')).toBe(false);
  });

  it('functions.cartTransform: SKIPS shared-activation teardown when a sibling cartTransform module is still PUBLISHED', async () => {
    moduleState.otherPublishedByType['functions.cartTransform'] = 1;
    db.set('shop_1:cartTransform', { functionKey: 'cartTransform', kind: 'cartTransform', activationGid: 'gid://shopify/CartTransform/7' });
    const { admin, calls } = mockAdmin(() => { throw new Error('no Shopify call expected — the shared activation is preserved'); });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = {
      type: 'functions.cartTransform', category: 'functions', name: 'Bundle',
      config: { bundles: [{ title: 'Duo', componentSkus: ['SKU-A', 'SKU-B'], bundleSku: 'DUO' }] },
    } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    expect(calls).toHaveLength(0);
    expect(report.deletedActivations).toEqual([]);
    expect(report.skipped).toEqual([
      { functionKey: 'cartTransform', reason: 'shared with another PUBLISHED functions.cartTransform module on this shop' },
    ]);
    // The stored activation row is NOT cleared — the sibling still needs it.
    expect(db.has('shop_1:cartTransform')).toBe(true);
  });

  it('functions.cartTransform: tears down cartTransform but LEAVES the discountRules leg alone when a real discountRules module is still PUBLISHED', async () => {
    moduleState.otherPublishedByType['functions.discountRules'] = 1;
    db.set('shop_1:cartTransform', { functionKey: 'cartTransform', kind: 'cartTransform', activationGid: 'gid://shopify/CartTransform/7' });
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppCartTransformDelete') return { data: { cartTransformDelete: { deletedId: 'gid://shopify/CartTransform/7', userErrors: [] } } };
      throw new Error(`unexpected ${op}`);
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = {
      type: 'functions.cartTransform', category: 'functions', name: 'Bundle',
      config: { bundles: [{ title: 'Duo', componentSkus: ['SKU-A', 'SKU-B'], bundleSku: 'DUO' }] },
    } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    // cartTransform itself is unshared → torn down. discountRules is shared with a
    // real discount module → left untouched (no writeBundlePricingRules/delete call).
    expect(calls.map((c) => c.op)).toEqual(['SuperAppCartTransformDelete']);
    expect(report.deletedActivations).toEqual(['cartTransform']);
    expect(report.skipped).toEqual([
      { functionKey: 'discountRules', reason: 'shared with another PUBLISHED functions.discountRules module on this shop' },
    ]);
  });

  it('functions.deliveryCustomization: SKIPS shared-activation teardown when a sibling PUBLISHED module of the same type exists — config + activation survive', async () => {
    moduleState.otherPublishedByType['functions.deliveryCustomization'] = 1;
    db.set('shop_1:deliveryCustomization', { functionKey: 'deliveryCustomization', kind: 'deliveryCustomization', activationGid: 'gid://shopify/DeliveryCustomization/1' });
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'MetaobjectByHandle') return { data: { metaobjectByHandle: { id: 'gid://mo/dc', field: { value: JSON.stringify({}) } } } };
      throw new Error(`unexpected ${op}`);
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'functions.deliveryCustomization', category: 'functions', name: 'DC', config: {} } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    // Only the existence probe runs — no delete/metafield-delete/activation-delete call.
    expect(calls.map((c) => c.op)).toEqual(['MetaobjectByHandle']);
    expect(report.deletedMetaobjects).toEqual([]);
    expect(report.deletedActivations).toEqual([]);
    expect(report.skipped).toEqual([
      { functionKey: 'deliveryCustomization', reason: 'shared with another PUBLISHED functions.deliveryCustomization module on this shop' },
    ]);
    expect(db.has('shop_1:deliveryCustomization')).toBe(true);
  });

  it('functions.deliveryCustomization: LAST published module of this type still tears down fully (no false-positive skip)', async () => {
    moduleState.otherPublishedByType['functions.deliveryCustomization'] = 0;
    db.set('shop_1:deliveryCustomization', { functionKey: 'deliveryCustomization', kind: 'deliveryCustomization', activationGid: 'gid://shopify/DeliveryCustomization/1' });
    const { admin } = mockAdmin((op) => {
      if (op === 'MetaobjectByHandle') return { data: { metaobjectByHandle: { id: 'gid://mo/dc', field: { value: JSON.stringify({}) } } } };
      if (op === 'MetaobjectDelete') return { data: { metaobjectDelete: { deletedId: 'gid://mo/dc', userErrors: [] } } };
      if (op === 'ShopId') return { data: { shop: { id: 'gid://shopify/Shop/1' } } };
      if (op === 'MetafieldsDelete') return { data: { metafieldsDelete: { userErrors: [] } } };
      if (op === 'SuperAppDeliveryCustomizationDelete') return { data: { deliveryCustomizationDelete: { deletedId: 'gid://shopify/DeliveryCustomization/1', userErrors: [] } } };
      throw new Error(`unexpected ${op}`);
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = { type: 'functions.deliveryCustomization', category: 'functions', name: 'DC', config: {} } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    expect(report.deletedMetaobjects).toEqual(['gid://mo/dc']);
    expect(report.deletedActivations).toEqual(['deliveryCustomization']);
    expect(report.skipped).toEqual([]);
    expect(db.has('shop_1:deliveryCustomization')).toBe(false);
  });

  it('flow.automation: inverts SHOP_METAFIELD_SET by deleting the shop metafield', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'ShopId') return { data: { shop: { id: 'gid://shopify/Shop/1' } } };
      if (op === 'MetafieldsDelete') return { data: { metafieldsDelete: { userErrors: [] } } };
      throw new Error(`unexpected ${op}`);
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = {
      type: 'flow.automation', category: 'FLOW', name: 'Welcome Flow',
      config: { trigger: 'ORDER_CREATED', steps: [] },
    } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    expect(calls.map((c) => c.op)).toEqual(['ShopId', 'MetafieldsDelete']);
    expect(calls[1]!.variables!.metafields).toEqual([
      { ownerId: 'gid://shopify/Shop/1', namespace: 'superapp_flow', key: 'flow_welcome-flow' },
    ]);
    expect(report.deletedShopMetafields).toEqual(['superapp_flow/flow_welcome-flow']);
  });

  it('messaging.campaign: inverts SHOP_METAFIELD_SET by deleting the shop metafield', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'ShopId') return { data: { shop: { id: 'gid://shopify/Shop/1' } } };
      if (op === 'MetafieldsDelete') return { data: { metafieldsDelete: { userErrors: [] } } };
      throw new Error(`unexpected ${op}`);
    });
    const { UnpublishService } = await import('~/services/publish/unpublish.service');
    const spec = {
      type: 'messaging.campaign', category: 'MESSAGING', name: 'Fall Sale',
      config: { channel: 'email' },
    } as never;
    const report = await new UnpublishService(admin, { shopId: 'shop_1' })
      .unpublish(spec, { kind: 'PLATFORM', moduleId: 'm1' } as never);
    expect(calls.map((c) => c.op)).toEqual(['ShopId', 'MetafieldsDelete']);
    expect(report.deletedShopMetafields).toEqual(['$app:superapp_messaging/campaign_fall-sale']);
  });
});

describe('ModuleService.markUnpublished (E7)', () => {
  it('flips module to DRAFT, clears activeVersionId, marks published versions UNPUBLISHED', async () => {
    moduleFixture.row = { id: 'm1', status: 'PUBLISHED', activeVersionId: 'v2' };
    const { ModuleService } = await import('~/services/modules/module.service');
    await new ModuleService().markUnpublished('shop.example.com', 'm1');

    expect(capturedCalls.moduleUpdate[0]).toMatchObject({
      where: { id: 'm1' },
      data: { status: 'DRAFT', activeVersionId: null },
    });
    expect(capturedCalls.versionUpdateMany[0]).toMatchObject({
      where: { moduleId: 'm1', status: 'PUBLISHED' },
      data: { status: 'UNPUBLISHED' },
    });
  });

  it('throws when the module is not found for this shop', async () => {
    moduleFixture.row = null;
    const { ModuleService } = await import('~/services/modules/module.service');
    await expect(new ModuleService().markUnpublished('shop.example.com', 'missing')).rejects.toThrow('Module not found');
    expect(capturedCalls.moduleUpdate).toHaveLength(0);
    expect(capturedCalls.versionUpdateMany).toHaveLength(0);
  });
});

describe('ModuleService.unpublishThenDelete', () => {
  it('published module: Shopify cleanup runs BEFORE the DB delete', async () => {
    const order: string[] = [];
    moduleDeleteHooks.onDelete = () => order.push('db');

    const specJson = JSON.stringify({ type: 'theme.section', category: 'STOREFRONT_UI', name: 'Banner', config: {} });
    moduleFixture.row = {
      id: 'm1',
      status: 'PUBLISHED',
      shop: { id: 'shop_1' },
      versions: [{ id: 'v1', status: 'PUBLISHED', specJson, targetThemeId: '1' }],
      activeVersion: { id: 'v1', status: 'PUBLISHED', specJson, targetThemeId: '1' },
    };

    const { admin } = mockAdmin((op, vars) => {
      order.push('shopify');
      switch (op) {
        case 'MetaobjectByHandle':
          return { data: { metaobjectByHandle: { id: 'gid://mo/theme1' } } };
        case 'ShopModuleRefs':
          return { data: { shop: { metafield: { value: JSON.stringify(['gid://mo/theme1']) } } } };
        case 'ShopId':
          return { data: { shop: { id: 'gid://shopify/Shop/1' } } };
        case 'MetafieldsSet':
          return { data: { metafieldsSet: { metafields: [{ id: 'mf1' }], userErrors: [] } } };
        case 'MetaobjectDelete':
          return { data: { metaobjectDelete: { deletedId: vars?.id, userErrors: [] } } };
        default:
          throw new Error(`unexpected ${op}`);
      }
    });

    const { ModuleService } = await import('~/services/modules/module.service');
    await new ModuleService().unpublishThenDelete(admin, 'shop.example.com', 'm1');

    expect(order.length).toBeGreaterThan(0);
    expect(order.indexOf('shopify')).toBeLessThan(order.indexOf('db'));
    expect(capturedCalls.moduleDelete[0]).toMatchObject({ where: { id: 'm1' } });
  });

  it('published status with no resolvable version: throws instead of silently deleting', async () => {
    moduleFixture.row = {
      id: 'm1',
      status: 'PUBLISHED',
      shop: { id: 'shop_1' },
      versions: [],
      activeVersion: null,
    };
    const { admin, calls } = mockAdmin(() => { throw new Error('no Shopify call expected'); });
    const { ModuleService } = await import('~/services/modules/module.service');
    await expect(new ModuleService().unpublishThenDelete(admin, 'shop.example.com', 'm1')).rejects.toThrow(
      'No published version found for published module m1 — refusing to delete without Shopify cleanup',
    );
    expect(calls).toHaveLength(0);
    expect(capturedCalls.moduleDelete).toHaveLength(0);
  });

  it('draft module: no Shopify calls, straight delete', async () => {
    moduleFixture.row = {
      id: 'm-draft',
      status: 'DRAFT',
      shop: { id: 'shop_1' },
      versions: [],
      activeVersion: null,
    };
    const { admin, calls } = mockAdmin(() => { throw new Error('no Shopify call expected for a draft module'); });
    const { ModuleService } = await import('~/services/modules/module.service');
    await new ModuleService().unpublishThenDelete(admin, 'shop.example.com', 'm-draft');
    expect(calls).toHaveLength(0);
    expect(capturedCalls.moduleDelete[0]).toMatchObject({ where: { id: 'm-draft' } });
  });

  it('throws when the module is not found for this shop — no delete', async () => {
    moduleFixture.row = null;
    const { admin, calls } = mockAdmin(() => { throw new Error('no Shopify call expected'); });
    const { ModuleService } = await import('~/services/modules/module.service');
    await expect(new ModuleService().unpublishThenDelete(admin, 'shop.example.com', 'missing')).rejects.toThrow('Module not found');
    expect(calls).toHaveLength(0);
    expect(capturedCalls.moduleDelete).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_TEMPLATES, type RecipeSpec } from '@superapp/core';
import type { AdminApiContext } from '~/types/shopify';

/**
 * WS-E final-review fix 1b — publish-time singleton enforcement. FunctionActivation
 * is `@@unique([shopId, functionKey])`: ONE row per shop, shared by every module of
 * a `functions.*` type, and the wasm reads ONE shop-level config. Before this fix a
 * second module of the same type could publish and silently clobber the first's
 * activation/config with no error. `PublishService.publish` now refuses loudly
 * (`FunctionKeyAlreadyPublishedError`) when a DIFFERENT module of the same type is
 * already PUBLISHED on the shop, while a republish of the SAME module (moduleId
 * match) is unaffected.
 */

const hoisted = vi.hoisted(() => ({
  moduleFindFirst: vi.fn(async (_args?: unknown) => null as { name: string } | null),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    module: { findFirst: hoisted.moduleFindFirst },
    shop: { findUnique: vi.fn(async () => ({ id: 'shop_1', shopDomain: 'test.myshopify.com' })) },
  }),
}));

function specForType(type: string): RecipeSpec | undefined {
  return MODULE_TEMPLATES.find((t) => t.spec.type === type)?.spec;
}

/** admin whose `graphql` throws — proves no Shopify I/O was attempted when the
 *  guard fires BEFORE compileRecipe (mirrors publish-functions-reliability.test.ts's
 *  explodingAdmin pattern for the ModuleNotPublishableError gate). */
const explodingAdmin = {
  graphql: () => {
    throw new Error('admin.graphql must not be called when the singleton guard refuses the publish');
  },
} as unknown as AdminApiContext['admin'];

/** admin whose `graphql` throws a DISTINCT sentinel — used to prove the guard let a
 *  publish proceed PAST it (into real compile/Shopify work), without having to stub
 *  out the entire discountRules publish GraphQL surface. */
const proceededAdmin = {
  graphql: () => {
    throw new Error('proceeded-past-singleton-guard');
  },
} as unknown as AdminApiContext['admin'];

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.moduleFindFirst.mockResolvedValue(null);
});

describe('PublishService — functionKey singleton enforcement (WS-E final-review fix 1b)', () => {
  it('refuses a second PUBLISHED module of the same functions.* type — clear merchant-facing error, no Shopify writes', async () => {
    hoisted.moduleFindFirst.mockResolvedValue({ name: 'Existing Discounts' });
    const spec = specForType('functions.discountRules');
    if (!spec) throw new Error('fixture missing functions.discountRules template');

    const { PublishService, FunctionKeyAlreadyPublishedError } = await import('~/services/publish/publish.service');
    const svc = new PublishService(explodingAdmin, { shopId: 'shop_1' });

    const err = await svc.publish(spec, { kind: 'PLATFORM', moduleId: 'm2' }).catch((e) => e);
    expect(err).toBeInstanceOf(FunctionKeyAlreadyPublishedError);
    expect(err.code).toBe('FUNCTION_KEY_ALREADY_PUBLISHED');
    expect(err.message).toBe(
      'A "functions.discountRules" module is already published on this store ("Existing Discounts"). ' +
        'Unpublish it first — each store can run one module of this function type at a time.',
    );

    // Excludes the module being published — a republish must never trip on itself.
    expect(hoisted.moduleFindFirst).toHaveBeenCalledWith({
      where: { shopId: 'shop_1', type: 'functions.discountRules', status: 'PUBLISHED', id: { not: 'm2' } },
      select: { name: true },
    });
  });

  it('republishing the SAME module (moduleId excluded from the lookup) is allowed — proceeds past the guard', async () => {
    // Simulates the real Prisma query: `id: { not: 'm1' }` finds no OTHER published
    // row when the only published row IS m1 itself.
    hoisted.moduleFindFirst.mockResolvedValue(null);
    const spec = specForType('functions.discountRules');
    if (!spec) throw new Error('fixture missing functions.discountRules template');

    const { PublishService, FunctionKeyAlreadyPublishedError } = await import('~/services/publish/publish.service');
    const svc = new PublishService(proceededAdmin, { shopId: 'shop_1' });

    const err = await svc.publish(spec, { kind: 'PLATFORM', moduleId: 'm1' }).catch((e) => e);
    // Never the singleton error — whatever failed, it failed further down the
    // pipeline (proceededAdmin's sentinel), proving the guard let this publish through.
    expect(err).not.toBeInstanceOf(FunctionKeyAlreadyPublishedError);
    expect(hoisted.moduleFindFirst).toHaveBeenCalledWith({
      where: { shopId: 'shop_1', type: 'functions.discountRules', status: 'PUBLISHED', id: { not: 'm1' } },
      select: { name: true },
    });
  });

  it('does not run the lookup at all for a non-functions.* type', async () => {
    const spec = specForType('theme.section');
    if (!spec) throw new Error('fixture missing theme.section template');
    const { PublishService } = await import('~/services/publish/publish.service');
    const svc = new PublishService(proceededAdmin, { shopId: 'shop_1' });
    await svc.publish(spec, { kind: 'THEME', themeId: '1', moduleId: 'm1' }).catch(() => {});
    expect(hoisted.moduleFindFirst).not.toHaveBeenCalled();
  });
});

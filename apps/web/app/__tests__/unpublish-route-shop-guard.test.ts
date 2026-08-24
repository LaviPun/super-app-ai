import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WS-E final-review fix 4 — api.modules.$moduleId.unpublish.tsx used to pass
 * `shopId: shopRow?.id` straight into `UnpublishService` without checking whether
 * `shopRow` resolved at all. When it didn't (Shop row missing for the session's
 * shop domain — e.g. a race during install/uninstall), `UnpublishService` ran with
 * `shopId: undefined`, which makes every shopId-gated teardown step (function
 * activation deletes, the shared web-pixel guard, the shared-sibling guards) a
 * silent no-op — yet the route still returned `{ ok: true }` and flipped the module
 * to DRAFT. The route now fails loud with 404 before touching Shopify or the module.
 */

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({
    session: { shop: 'test-shop.myshopify.com' },
    admin: { graphql: vi.fn() },
  })),
  shopFindUnique: vi.fn(async () => null as { id: string } | null),
  getModule: vi.fn(async () => ({
    id: 'mod-1',
    status: 'PUBLISHED',
    activeVersion: { id: 'ver-1', status: 'PUBLISHED', specJson: JSON.stringify({ type: 'theme.section', category: 'STOREFRONT_UI', name: 'Banner', config: {} }), targetThemeId: '1' },
    versions: [{ id: 'ver-1', status: 'PUBLISHED', specJson: JSON.stringify({ type: 'theme.section', category: 'STOREFRONT_UI', name: 'Banner', config: {} }), targetThemeId: '1' }],
  })),
  markUnpublished: vi.fn(async () => {}),
  unpublish: vi.fn(async () => ({ removedRefs: [], deletedMetaobjects: [], deletedActivations: [], deletedWebPixel: false, deletedShopMetafields: [], skipped: [] })),
  log: vi.fn(async () => {}),
  enforceRateLimit: vi.fn(async () => {}),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ shop: { findUnique: hoisted.shopFindUnique } }),
}));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    getModule = hoisted.getModule;
    markUnpublished = hoisted.markUnpublished;
  },
}));
vi.mock('~/services/recipes/recipe.service', () => ({
  RecipeService: class {
    parse = (json: string) => JSON.parse(json);
  },
}));
vi.mock('~/services/publish/unpublish.service', () => ({
  UnpublishService: class {
    unpublish = hoisted.unpublish;
  },
}));
vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));
vi.mock('~/services/security/rate-limit.server', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.authenticateAdmin.mockResolvedValue({
    session: { shop: 'test-shop.myshopify.com' },
    admin: { graphql: vi.fn() },
  });
  hoisted.shopFindUnique.mockResolvedValue(null);
  hoisted.enforceRateLimit.mockResolvedValue(undefined);
  hoisted.unpublish.mockResolvedValue({ removedRefs: [], deletedMetaobjects: [], deletedActivations: [], deletedWebPixel: false, deletedShopMetafields: [], skipped: [] });
});

describe('POST /api/modules/:moduleId/unpublish — missing shop row (WS-E final-review fix 4)', () => {
  it('returns 404 "Shop not found" and never calls UnpublishService or flips the module', async () => {
    const { action } = await import('~/routes/api.modules.$moduleId.unpublish');
    const request = new Request('https://app.example.com/api/modules/mod-1/unpublish', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const response = await action({ request, params: { moduleId: 'mod-1' } });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: 'Shop not found' });

    expect(hoisted.getModule).not.toHaveBeenCalled();
    expect(hoisted.unpublish).not.toHaveBeenCalled();
    expect(hoisted.markUnpublished).not.toHaveBeenCalled();
  });

  it('with a resolvable shop row: proceeds normally (sanity check the guard does not break the happy path)', async () => {
    hoisted.shopFindUnique.mockResolvedValue({ id: 'shop_1' });
    const { action } = await import('~/routes/api.modules.$moduleId.unpublish');
    const request = new Request('https://app.example.com/api/modules/mod-1/unpublish', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const response = await action({ request, params: { moduleId: 'mod-1' } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(hoisted.unpublish).toHaveBeenCalledTimes(1);
    expect(hoisted.markUnpublished).toHaveBeenCalledTimes(1);
  });
});

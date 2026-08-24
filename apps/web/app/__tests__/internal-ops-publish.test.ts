import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * internal.ops 'publish' intent (adjudicated fix, WS-E) — this intent used to
 * call ONLY ModuleService.markPublishedWithTransition (a DB flip), so an
 * internal admin could mark a module "published" with ZERO Shopify writes,
 * silently diverging from the merchant /api/publish path. These tests assert
 * the intent now runs the REAL publish pipeline (PublishService.publish)
 * BEFORE the DB transition — mirroring the 'rollback' intent's
 * real-publish-then-flip order in the same file — and that a publish failure
 * never reaches the DB flip.
 */

const order: string[] = [];

const hoisted = vi.hoisted(() => ({
  publish: vi.fn(async () => ({ compiledJson: '{}', preflight: { willDeploy: true } })),
  markPublishedWithTransition: vi.fn(async () => {}),
  parseSpec: vi.fn((json: string) => JSON.parse(json)),
  findUnique: vi.fn(async () => null as Record<string, unknown> | null),
  unauthenticatedAdmin: vi.fn(async () => ({ admin: { graphql: vi.fn() } })),
  requireInternalAdmin: vi.fn(async () => undefined),
  activityLog: vi.fn(async () => {}),
}));

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: hoisted.requireInternalAdmin,
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    module: { findUnique: hoisted.findUnique },
  }),
}));

vi.mock('~/services/recipes/recipe.service', () => ({
  RecipeService: class {
    parse = hoisted.parseSpec;
  },
}));

vi.mock('~/services/publish/publish.service', () => ({
  PublishService: class {
    publish = hoisted.publish;
  },
}));

vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    markPublishedWithTransition = hoisted.markPublishedWithTransition;
  },
}));

vi.mock('~/shopify.server', () => ({
  unauthenticated: { admin: hoisted.unauthenticatedAdmin },
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.activityLog;
  },
}));

function makeFormRequest(body: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.set(key, value);
  return new Request('http://test/internal/ops', { method: 'POST', body: form });
}

const baseModuleRow = {
  id: 'm1',
  name: 'Test Module',
  shopId: 'shop_1',
  activeVersionId: null as string | null,
  shop: { shopDomain: 'shop.example.com' },
  activeVersion: null as Record<string, unknown> | null,
  versions: [
    {
      id: 'v1',
      version: 1,
      status: 'DRAFT',
      specJson: JSON.stringify({ type: 'checkout.block', category: 'CHECKOUT_UI', name: 'Upsell', config: {} }),
      targetThemeId: null,
    },
  ],
};

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
  hoisted.findUnique.mockImplementation(async () => baseModuleRow);
  hoisted.parseSpec.mockImplementation((json: string) => JSON.parse(json));
  hoisted.unauthenticatedAdmin.mockResolvedValue({ admin: { graphql: vi.fn() } });
  hoisted.publish.mockImplementation(async () => {
    order.push('shopify');
    return { compiledJson: '{}', preflight: { willDeploy: true } };
  });
  hoisted.markPublishedWithTransition.mockImplementation(async () => {
    order.push('db-flip');
  });
});

describe("internal.ops 'publish' intent — real publish, then DB flip (adjudicated fix)", () => {
  it('runs PublishService.publish against a REAL resolved admin client BEFORE the DB transition', async () => {
    const { action } = await import('~/routes/internal.ops');
    const response = await action({ request: makeFormRequest({ intent: 'publish', id: 'm1' }), params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean; message: string };
    expect(json.ok).toBe(true);
    expect(json.message).toContain('Published Test Module v1');

    expect(hoisted.unauthenticatedAdmin).toHaveBeenCalledWith('shop.example.com');
    expect(hoisted.publish).toHaveBeenCalledTimes(1);
    expect(hoisted.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'checkout.block' }),
      { kind: 'PLATFORM', moduleId: 'm1' },
    );
    expect(hoisted.markPublishedWithTransition).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['shopify', 'db-flip']);
  });

  it('does NOT flip the DB when the real publish throws (no silent "published" with zero Shopify writes)', async () => {
    hoisted.publish.mockImplementation(async () => {
      throw new Error('Shopify write failed');
    });

    const { action } = await import('~/routes/internal.ops');
    const response = await action({ request: makeFormRequest({ intent: 'publish', id: 'm1' }), params: {}, context: {} } as never);

    expect(response.status).toBe(500);
    const json = (await response.json()) as { ok: boolean; message: string };
    expect(json.ok).toBe(false);
    expect(json.message).toContain('Shopify write failed');

    expect(hoisted.markPublishedWithTransition).not.toHaveBeenCalled();
    expect(order).not.toContain('db-flip');
  });

  it('resolves a theme.* target from the version\'s own targetThemeId', async () => {
    hoisted.findUnique.mockImplementation(async () => ({
      ...baseModuleRow,
      versions: [
        {
          id: 'v1',
          version: 1,
          status: 'DRAFT',
          specJson: JSON.stringify({ type: 'theme.section', category: 'STOREFRONT_UI', name: 'Banner', config: {} }),
          targetThemeId: '77',
        },
      ],
    }));

    const { action } = await import('~/routes/internal.ops');
    await action({ request: makeFormRequest({ intent: 'publish', id: 'm1' }), params: {}, context: {} } as never);

    expect(hoisted.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'theme.section' }),
      { kind: 'THEME', themeId: '77', moduleId: 'm1' },
    );
    expect(hoisted.markPublishedWithTransition).toHaveBeenCalledWith(
      expect.objectContaining({ targetThemeId: '77' }),
    );
  });

  it('falls back to the active version\'s targetThemeId when the draft has none', async () => {
    hoisted.findUnique.mockImplementation(async () => ({
      ...baseModuleRow,
      activeVersion: { targetThemeId: '99' },
      versions: [
        {
          id: 'v1',
          version: 1,
          status: 'DRAFT',
          specJson: JSON.stringify({ type: 'theme.section', category: 'STOREFRONT_UI', name: 'Banner', config: {} }),
          targetThemeId: null,
        },
      ],
    }));

    const { action } = await import('~/routes/internal.ops');
    await action({ request: makeFormRequest({ intent: 'publish', id: 'm1' }), params: {}, context: {} } as never);

    expect(hoisted.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'theme.section' }),
      { kind: 'THEME', themeId: '99', moduleId: 'm1' },
    );
  });

  it('theme module with no recorded targetThemeId anywhere fails loudly without publishing or flipping', async () => {
    hoisted.findUnique.mockImplementation(async () => ({
      ...baseModuleRow,
      versions: [
        {
          id: 'v1',
          version: 1,
          status: 'DRAFT',
          specJson: JSON.stringify({ type: 'theme.section', category: 'STOREFRONT_UI', name: 'Banner', config: {} }),
          targetThemeId: null,
        },
      ],
    }));

    const { action } = await import('~/routes/internal.ops');
    const response = await action({ request: makeFormRequest({ intent: 'publish', id: 'm1' }), params: {}, context: {} } as never);

    expect(response.status).toBe(400);
    const json = (await response.json()) as { ok: boolean; message: string };
    expect(json.ok).toBe(false);
    expect(json.message).toMatch(/theme/i);
    expect(hoisted.publish).not.toHaveBeenCalled();
    expect(hoisted.markPublishedWithTransition).not.toHaveBeenCalled();
  });

  it('already-published active version short-circuits without calling publish again', async () => {
    hoisted.findUnique.mockImplementation(async () => ({
      ...baseModuleRow,
      activeVersionId: 'v1',
      versions: [{ ...baseModuleRow.versions[0], status: 'PUBLISHED' }],
    }));

    const { action } = await import('~/routes/internal.ops');
    const response = await action({ request: makeFormRequest({ intent: 'publish', id: 'm1' }), params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean; message: string };
    expect(json.message).toContain('already published');
    expect(hoisted.publish).not.toHaveBeenCalled();
    expect(hoisted.markPublishedWithTransition).not.toHaveBeenCalled();
  });
});

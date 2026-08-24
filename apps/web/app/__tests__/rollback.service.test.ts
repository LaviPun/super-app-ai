import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminApiContext } from '~/types/shopify';

/**
 * RollbackService (WS-E Task 13) — rollback is a REPUBLISH, not a DB-only flip.
 * These tests assert: (1) the target version's spec is republished through the
 * normal PublishService pipeline BEFORE ModuleService.rollbackToVersion flips
 * activeVersionId, (2) a republish failure never reaches the DB flip (no
 * DB/Shopify drift), and (3) a theme module with no recorded targetThemeId on
 * either the target or currently-active version fails loudly instead of
 * guessing a theme.
 *
 * PublishService and ModuleService are mocked at the module boundary — this
 * suite is about RollbackService's own contract (version resolution, target
 * derivation, call order, error propagation), not PublishService's internals
 * (covered by publish.service tests) or ModuleService's DB flip (covered by
 * module.service tests).
 */

const order: string[] = [];

const versionFixture: { row: Record<string, unknown> | null } = { row: null };

const hoisted = vi.hoisted(() => ({
  publish: vi.fn(async () => {}),
  rollbackToVersion: vi.fn(async () => {}),
  parseSpec: vi.fn((json: string) => JSON.parse(json)),
  findFirst: vi.fn(async () => null as Record<string, unknown> | null),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    moduleVersion: {
      findFirst: hoisted.findFirst,
    },
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
    rollbackToVersion = hoisted.rollbackToVersion;
  },
}));

const admin = {} as AdminApiContext['admin'];

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
  versionFixture.row = null;
  hoisted.findFirst.mockImplementation(async () => versionFixture.row);
  hoisted.parseSpec.mockImplementation((json: string) => JSON.parse(json));
  hoisted.publish.mockImplementation(async () => {
    order.push('shopify');
  });
  hoisted.rollbackToVersion.mockImplementation(async () => {
    order.push('db-flip');
  });
});

describe('RollbackService — rollback IS a republish (WS-E finding 3)', () => {
  it('publishes the target version spec to Shopify, THEN flips activeVersionId', async () => {
    versionFixture.row = {
      id: 'v1',
      version: 1,
      specJson: JSON.stringify({ type: 'checkout.block', category: 'CHECKOUT_UI', name: 'Upsell', config: {} }),
      targetThemeId: null,
      module: { activeVersion: null },
    };

    const { RollbackService } = await import('~/services/publish/rollback.service');
    const mv = await new RollbackService(admin, { shop: 'shop.example.com', shopId: 'shop_1' })
      .rollbackToVersion('m1', 1);

    expect(mv.version).toBe(1);
    expect(mv.id).toBe('v1');
    expect(hoisted.publish).toHaveBeenCalledTimes(1);
    expect(hoisted.rollbackToVersion).toHaveBeenCalledWith('shop.example.com', 'm1', 1);
    expect(order).toEqual(['shopify', 'db-flip']);
  });

  it('resolves a theme.* target from the target version\'s own targetThemeId', async () => {
    versionFixture.row = {
      id: 'v2',
      version: 2,
      specJson: JSON.stringify({ type: 'theme.section', category: 'STOREFRONT_UI', name: 'Banner', config: {} }),
      targetThemeId: '77',
      module: { activeVersion: null },
    };

    const { RollbackService } = await import('~/services/publish/rollback.service');
    await new RollbackService(admin, { shop: 'shop.example.com', shopId: 'shop_1' }).rollbackToVersion('m1', 2);

    expect(hoisted.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'theme.section' }),
      { kind: 'THEME', themeId: '77', moduleId: 'm1' },
    );
  });

  it('falls back to the currently-active version\'s targetThemeId when the target version has none', async () => {
    versionFixture.row = {
      id: 'v1',
      version: 1,
      specJson: JSON.stringify({ type: 'theme.section', category: 'STOREFRONT_UI', name: 'Banner', config: {} }),
      targetThemeId: null,
      module: { activeVersion: { targetThemeId: '99' } },
    };

    const { RollbackService } = await import('~/services/publish/rollback.service');
    await new RollbackService(admin, { shop: 'shop.example.com', shopId: 'shop_1' }).rollbackToVersion('m1', 1);

    expect(hoisted.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'theme.section' }),
      { kind: 'THEME', themeId: '99', moduleId: 'm1' },
    );
  });

  it('does NOT flip activeVersionId when the republish throws (no DB/Shopify drift)', async () => {
    versionFixture.row = {
      id: 'v1',
      version: 1,
      specJson: JSON.stringify({ type: 'checkout.block', category: 'CHECKOUT_UI', name: 'Upsell', config: {} }),
      targetThemeId: null,
      module: { activeVersion: null },
    };
    hoisted.publish.mockImplementation(async () => {
      throw new Error('shopify down');
    });

    const { RollbackService } = await import('~/services/publish/rollback.service');
    await expect(
      new RollbackService(admin, { shop: 'shop.example.com', shopId: 'shop_1' }).rollbackToVersion('m1', 1),
    ).rejects.toThrow('shopify down');

    expect(hoisted.rollbackToVersion).not.toHaveBeenCalled();
    expect(order).not.toContain('db-flip');
  });

  it('theme module with no recorded targetThemeId anywhere fails loudly (cannot guess a theme)', async () => {
    versionFixture.row = {
      id: 'v1',
      version: 1,
      specJson: JSON.stringify({ type: 'theme.section', category: 'STOREFRONT_UI', name: 'Banner', config: {} }),
      targetThemeId: null,
      module: { activeVersion: null },
    };

    const { RollbackService } = await import('~/services/publish/rollback.service');
    await expect(
      new RollbackService(admin, { shop: 'shop.example.com', shopId: 'shop_1' }).rollbackToVersion('m1', 1),
    ).rejects.toThrow(/theme/i);

    expect(hoisted.publish).not.toHaveBeenCalled();
    expect(hoisted.rollbackToVersion).not.toHaveBeenCalled();
  });

  it('throws when the requested version does not exist for this shop', async () => {
    versionFixture.row = null;

    const { RollbackService } = await import('~/services/publish/rollback.service');
    await expect(
      new RollbackService(admin, { shop: 'shop.example.com', shopId: 'shop_1' }).rollbackToVersion('m1', 99),
    ).rejects.toThrow('Version not found');

    expect(hoisted.publish).not.toHaveBeenCalled();
    expect(hoisted.rollbackToVersion).not.toHaveBeenCalled();
  });
});

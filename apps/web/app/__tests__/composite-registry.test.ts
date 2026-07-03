/**
 * R3.6 — composite registry lookup + BACK-COMPAT.
 *
 * `findShopCompositeRecords` reads a shop's published composite records from
 * `Recipe.compositeJson`. The back-compat contract: a recipe with NO manifest (a
 * flat blueprint / single module — compositeJson null or non-composite) contributes
 * NOTHING, so the R3.6 engines never act on a non-composite module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({ recipeFindMany: vi.fn() }));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({ recipe: { findMany: hoisted.recipeFindMany } }),
}));

// Mirror the real parseCompositeManifest contract: null/invalid/empty → null,
// never throws (the registry relies on this graceful behavior).
vi.mock('~/services/blueprints/blueprint.service', () => ({
  parseCompositeManifest: (json: string | null) => {
    if (!json) return null;
    try {
      const raw = JSON.parse(json);
      const sharedRecords = Array.isArray(raw.sharedRecords) ? raw.sharedRecords : [];
      if (sharedRecords.length === 0) return null;
      return { sharedRecords, bindings: raw.bindings ?? [], memberRoles: raw.memberRoles ?? [] };
    } catch {
      return null;
    }
  },
}));

import { findShopCompositeRecords } from '~/services/composites/composite-registry.server';

const ledger = { ref: 'points', kind: 'loyalty-ledger', backing: 'DATA_STORE' };
const sub = { ref: 'subscribe', kind: 'subscription-contract', backing: 'SHOPIFY_CONTRACT' };

beforeEach(() => vi.clearAllMocks());

describe('findShopCompositeRecords', () => {
  it('returns only records of the requested kind', async () => {
    hoisted.recipeFindMany.mockResolvedValue([
      { id: 'r1', compositeJson: JSON.stringify({ sharedRecords: [ledger, sub], bindings: [], memberRoles: [] }) },
    ]);
    const ledgers = await findShopCompositeRecords('shop_1', 'loyalty-ledger');
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]!.record.ref).toBe('points');
    expect(ledgers[0]!.recipeId).toBe('r1');

    const subs = await findShopCompositeRecords('shop_1', 'subscription-contract');
    expect(subs).toHaveLength(1);
    expect(subs[0]!.record.ref).toBe('subscribe');
  });

  it('BACK-COMPAT: a flat blueprint (no manifest) contributes nothing', async () => {
    hoisted.recipeFindMany.mockResolvedValue([
      { id: 'flat', compositeJson: null },
      { id: 'bad', compositeJson: '{ not valid json' },
      { id: 'empty', compositeJson: JSON.stringify({ sharedRecords: [] }) },
    ]);
    const out = await findShopCompositeRecords('shop_1', 'loyalty-ledger');
    expect(out).toEqual([]);
  });

  it('aggregates across multiple composite recipes in creation order', async () => {
    hoisted.recipeFindMany.mockResolvedValue([
      { id: 'r1', compositeJson: JSON.stringify({ sharedRecords: [{ ...ledger, ref: 'a' }], bindings: [], memberRoles: [] }) },
      { id: 'r2', compositeJson: JSON.stringify({ sharedRecords: [{ ...ledger, ref: 'b' }], bindings: [], memberRoles: [] }) },
    ]);
    const out = await findShopCompositeRecords('shop_1', 'loyalty-ledger');
    expect(out.map((o) => o.record.ref)).toEqual(['a', 'b']);
  });
});

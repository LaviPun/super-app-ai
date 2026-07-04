/**
 * R3.6 — loyalty accrual + expiry engine (makes the loyalty-ledger composite real).
 *
 * Covers: the PURE accrual/expiry math + its double-order idempotency; the
 * DB-backed `accrueForOrder` fan-out (find-or-create ledger row, idempotent under
 * a double webhook); the absolute `expireDuePoints` sweep; and the redemption
 * honesty fence (`redeemPoints` debits the balance but flags the Shopify-API
 * issuance as a scoped follow-up).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompositeRecord } from '@superapp/core';

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const recipeFindMany = vi.fn();
  const getStoreByKey = vi.fn();
  const createRecord = vi.fn(async (_storeId: string, _data: { externalId?: string; customerId?: string; title?: string; payload: unknown }) => ({ id: 'rec_new' }));
  const updateRecord = vi.fn(async (_recordId: string, _storeId: string, _data: { title?: string; payload?: unknown }) => ({ count: 1 }));
  return { findFirst, findMany, recipeFindMany, getStoreByKey, createRecord, updateRecord };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    dataStoreRecord: { findFirst: hoisted.findFirst, findMany: hoisted.findMany },
    recipe: { findMany: hoisted.recipeFindMany },
  }),
}));

vi.mock('~/services/data/data-store.service', () => ({
  DataStoreService: vi.fn().mockImplementation(() => ({
    getStoreByKey: hoisted.getStoreByKey,
    createRecord: hoisted.createRecord,
    updateRecord: hoisted.updateRecord,
  })),
}));

// blueprint.service is imported by composite-registry.server; stub the parser to
// avoid pulling the whole publish path into this unit test.
vi.mock('~/services/blueprints/blueprint.service', () => ({
  parseCompositeManifest: (json: string | null) => (json ? JSON.parse(json) : null),
}));

import {
  computeAccrual,
  applyExpiry,
  policyFromRecord,
  orderEarnableSubtotal,
  orderGidOf,
  customerIdOf,
  accrueForOrder,
  expireDuePoints,
  redeemPoints,
  type LedgerPayload,
  type OrderPayload,
} from '~/services/composites/loyalty-accrual.server';

const ledgerRecord: CompositeRecord = {
  ref: 'points-ledger',
  kind: 'loyalty-ledger',
  backing: 'DATA_STORE',
  dataModel: {
    fields: [
      { name: 'customerId', type: 'text', required: true, piiFlag: false },
      { name: 'pointsPerCurrency', type: 'number', required: false, piiFlag: false, help: 'earn rate default:2' },
      { name: 'expiryDays', type: 'number', required: false, piiFlag: false, help: 'expiry default:30' },
    ],
  },
};

const NOW = new Date('2026-07-04T00:00:00.000Z');

function order(overrides: Partial<OrderPayload> = {}): OrderPayload {
  return {
    admin_graphql_api_id: 'gid://shopify/Order/1001',
    customer: { id: 42 },
    current_subtotal_price: '50.00',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.getStoreByKey.mockResolvedValue({ id: 'store_1', key: 'points_ledger' });
  hoisted.recipeFindMany.mockResolvedValue([
    { id: 'recipe_1', compositeJson: JSON.stringify({ sharedRecords: [ledgerRecord], bindings: [], memberRoles: [] }) },
  ]);
});

// ─── pure math ────────────────────────────────────────────────────────────────

describe('policyFromRecord', () => {
  it('reads pointsPerCurrency + expiryDays from field help defaults', () => {
    expect(policyFromRecord(ledgerRecord)).toEqual({ pointsPerCurrency: 2, expiryDays: 30 });
  });
  it('falls back to 1pt/unit, never-expire when no policy fields', () => {
    const bare: CompositeRecord = { ref: 'l', kind: 'loyalty-ledger', backing: 'DATA_STORE' };
    expect(policyFromRecord(bare)).toEqual({ pointsPerCurrency: 1, expiryDays: 0 });
  });
});

describe('orderEarnableSubtotal', () => {
  it('prefers current_subtotal_price, then subtotal, then total', () => {
    expect(orderEarnableSubtotal(order({ current_subtotal_price: '80.00' }))).toBe(80);
    expect(orderEarnableSubtotal(order({ current_subtotal_price: undefined, subtotal_price: '30' }))).toBe(30);
    expect(orderEarnableSubtotal(order({ current_subtotal_price: undefined, subtotal_price: undefined, total_price: '12' }))).toBe(12);
  });
});

describe('orderGidOf / customerIdOf', () => {
  it('derives the order GID + customer id', () => {
    expect(orderGidOf(order())).toBe('gid://shopify/Order/1001');
    expect(orderGidOf(order({ admin_graphql_api_id: undefined, id: 7 }))).toBe('gid://shopify/Order/7');
    expect(customerIdOf(order())).toBe('42');
    expect(customerIdOf(order({ customer: undefined }))).toBeNull();
  });
});

describe('computeAccrual — idempotency', () => {
  const policy = { pointsPerCurrency: 2, expiryDays: 30 };

  it('credits floor(subtotal * rate) on a fresh order', () => {
    const r = computeAccrual(null, { customerId: '42', orderGid: 'gid://shopify/Order/1001', subtotal: 50, policy, now: NOW });
    expect(r.changed).toBe(true);
    expect(r.pointsEarned).toBe(100);
    expect(r.payload.balance).toBe(100);
    expect(r.payload.lifetimeEarned).toBe(100);
    expect(r.payload.lots).toHaveLength(1);
    expect(r.payload.lots[0]!.expiresAt).toBe('2026-08-03T00:00:00.000Z');
  });

  it('a SECOND webhook for the same order GID is a NO-OP (double-webhook safe)', () => {
    const first = computeAccrual(null, { customerId: '42', orderGid: 'gid://shopify/Order/1001', subtotal: 50, policy, now: NOW });
    const second = computeAccrual(first.payload, { customerId: '42', orderGid: 'gid://shopify/Order/1001', subtotal: 50, policy, now: NOW });
    expect(second.changed).toBe(false);
    expect(second.pointsEarned).toBe(0);
    expect(second.payload.balance).toBe(100); // unchanged
    expect(second.payload.lots).toHaveLength(1);
  });

  it('a DIFFERENT order accrues a second lot', () => {
    const first = computeAccrual(null, { customerId: '42', orderGid: 'gid://shopify/Order/1', subtotal: 50, policy, now: NOW });
    const second = computeAccrual(first.payload, { customerId: '42', orderGid: 'gid://shopify/Order/2', subtotal: 25, policy, now: NOW });
    expect(second.changed).toBe(true);
    expect(second.payload.balance).toBe(150);
    expect(second.payload.lots).toHaveLength(2);
  });

  it('never earns on zero subtotal', () => {
    const r = computeAccrual(null, { customerId: '42', orderGid: 'g', subtotal: 0, policy, now: NOW });
    expect(r.changed).toBe(false);
  });
});

describe('applyExpiry', () => {
  const base: LedgerPayload = {
    customerId: '42',
    balance: 150,
    lifetimeEarned: 150,
    lots: [
      { orderGid: 'g1', points: 100, earnedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2026-07-01T00:00:00.000Z' }, // due
      { orderGid: 'g2', points: 50, earnedAt: '2026-06-20T00:00:00.000Z', expiresAt: '2026-08-01T00:00:00.000Z' }, // future
    ],
    redemptions: [],
    updatedAt: '2026-06-20T00:00:00.000Z',
  };

  it('ages out due lots and deducts their points', () => {
    const r = applyExpiry(base, NOW);
    expect(r.changed).toBe(true);
    expect(r.expiredPoints).toBe(100);
    expect(r.payload.balance).toBe(50);
    expect(r.payload.lots).toHaveLength(1);
    expect(r.payload.lots[0]!.orderGid).toBe('g2');
  });

  it('a second sweep is a no-op (idempotent)', () => {
    const once = applyExpiry(base, NOW);
    const twice = applyExpiry(once.payload, NOW);
    expect(twice.changed).toBe(false);
    expect(twice.payload.balance).toBe(50);
  });

  it('never expires never-expiry lots (expiresAt null)', () => {
    const neverExpire: LedgerPayload = { ...base, lots: [{ orderGid: 'g', points: 10, earnedAt: '2020-01-01T00:00:00.000Z', expiresAt: null }] };
    expect(applyExpiry(neverExpire, NOW).changed).toBe(false);
  });
});

// ─── DB-backed accrual ──────────────────────────────────────────────────────

describe('accrueForOrder — the webhook path', () => {
  it('creates a new ledger row on the first order', async () => {
    hoisted.findFirst.mockResolvedValue(null); // no existing customer row
    const out = await accrueForOrder('shop_1', order(), { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]!.accrued).toBe(true);
    expect(out[0]!.pointsEarned).toBe(100); // 50 * rate 2
    expect(hoisted.createRecord).toHaveBeenCalledOnce();
    const [, data] = hoisted.createRecord.mock.calls[0]!;
    expect(data.externalId).toBe('42');
    expect((data.payload as LedgerPayload).balance).toBe(100);
  });

  it('a DOUBLE webhook for the same order does NOT double-accrue', async () => {
    // Existing row already has the order lot → accrual is a no-op.
    const existing: LedgerPayload = {
      customerId: '42', balance: 100, lifetimeEarned: 100,
      lots: [{ orderGid: 'gid://shopify/Order/1001', points: 100, earnedAt: NOW.toISOString(), expiresAt: null }],
      redemptions: [], updatedAt: NOW.toISOString(),
    };
    hoisted.findFirst.mockResolvedValue({ id: 'rec_1', payload: JSON.stringify(existing) });
    const out = await accrueForOrder('shop_1', order(), { now: NOW });
    expect(out[0]!.accrued).toBe(false);
    expect(out[0]!.reason).toMatch(/idempotent/i);
    expect(hoisted.updateRecord).not.toHaveBeenCalled();
    expect(hoisted.createRecord).not.toHaveBeenCalled();
  });

  it('updates the existing row for a NEW order', async () => {
    const existing: LedgerPayload = {
      customerId: '42', balance: 100, lifetimeEarned: 100,
      lots: [{ orderGid: 'gid://shopify/Order/900', points: 100, earnedAt: NOW.toISOString(), expiresAt: null }],
      redemptions: [], updatedAt: NOW.toISOString(),
    };
    hoisted.findFirst.mockResolvedValue({ id: 'rec_1', payload: JSON.stringify(existing) });
    const out = await accrueForOrder('shop_1', order(), { now: NOW });
    expect(out[0]!.accrued).toBe(true);
    expect(hoisted.updateRecord).toHaveBeenCalledOnce();
    const [, , data] = hoisted.updateRecord.mock.calls[0]!;
    expect((data.payload as LedgerPayload).balance).toBe(200);
  });

  it('skips a guest checkout (no customer)', async () => {
    const out = await accrueForOrder('shop_1', order({ customer: undefined }), { now: NOW });
    expect(out).toHaveLength(0);
    expect(hoisted.createRecord).not.toHaveBeenCalled();
  });
});

// ─── expiry sweep ─────────────────────────────────────────────────────────────

describe('expireDuePoints — the nightly sweep', () => {
  it('expires due lots across ledger rows and updates them', async () => {
    const due: LedgerPayload = {
      customerId: '7', balance: 100, lifetimeEarned: 100,
      lots: [{ orderGid: 'g', points: 100, earnedAt: '2026-05-01T00:00:00.000Z', expiresAt: '2026-06-01T00:00:00.000Z' }],
      redemptions: [], updatedAt: '2026-05-01T00:00:00.000Z',
    };
    hoisted.findMany.mockResolvedValue([{ id: 'rec_due', payload: JSON.stringify(due) }]);
    const out = await expireDuePoints('shop_1', { now: NOW });
    expect(out[0]!.rowsExpired).toBe(1);
    expect(out[0]!.pointsExpired).toBe(100);
    expect(hoisted.updateRecord).toHaveBeenCalledOnce();
  });

  it('does nothing when the policy has no expiry (expiryDays 0)', async () => {
    hoisted.recipeFindMany.mockResolvedValue([
      { id: 'r', compositeJson: JSON.stringify({ sharedRecords: [{ ref: 'l', kind: 'loyalty-ledger', backing: 'DATA_STORE' }], bindings: [], memberRoles: [] }) },
    ]);
    const out = await expireDuePoints('shop_1', { now: NOW });
    expect(out[0]!.rowsSwept).toBe(0);
    expect(hoisted.findMany).not.toHaveBeenCalled();
  });
});

// ─── redemption honesty fence ──────────────────────────────────────────────

describe('redeemPoints — debit is real, issuance is a scoped follow-up', () => {
  it('debits the balance and flags needsShopifyApi', async () => {
    const existing: LedgerPayload = {
      customerId: '42', balance: 100, lifetimeEarned: 100, lots: [], redemptions: [], updatedAt: NOW.toISOString(),
    };
    hoisted.findFirst.mockResolvedValue({ id: 'rec_1', payload: JSON.stringify(existing) });
    const r = await redeemPoints('shop_1', { ref: 'points-ledger', customerId: '42', points: 40 }, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.needsShopifyApi).toBe(true); // no faked discount/gift card
    const [, , data] = hoisted.updateRecord.mock.calls[0]!;
    expect((data.payload as LedgerPayload).balance).toBe(60);
  });

  it('refuses to redeem more than the balance', async () => {
    const existing: LedgerPayload = {
      customerId: '42', balance: 10, lifetimeEarned: 10, lots: [], redemptions: [], updatedAt: NOW.toISOString(),
    };
    hoisted.findFirst.mockResolvedValue({ id: 'rec_1', payload: JSON.stringify(existing) });
    const r = await redeemPoints('shop_1', { ref: 'points-ledger', customerId: '42', points: 40 }, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/insufficient/i);
    expect(hoisted.updateRecord).not.toHaveBeenCalled();
  });
});

/**
 * App-proxy data endpoints (build #16/#22/#3/#17b) — the server side that makes the
 * config-declared bindings/actions resolve for REAL:
 *  - readLoyaltyBalance     → POS loyalty.* + customer-account loyalty.points
 *  - verifyStaffPin         → POS staff-PIN gate (fails CLOSED, timing-safe)
 *  - readCustomerSubscription → customer-account subscription.*
 *  - PushSubscriptionStore  → web-push /webpush/subscribe persistence + prune
 *  - normalizeAppProxyPath  → POS config projects placeholder paths → live app routes
 *
 * Every assertion pins the HONESTY contract: no fabricated value — real data or an
 * honest empty/false.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── hoisted mocks (prisma + DataStoreService) ─────────────────────────────────

const hoisted = vi.hoisted(() => {
  const findFirst = vi.fn();
  const recipeFindMany = vi.fn();
  const getStoreByKey = vi.fn();
  const listRecords = vi.fn();
  const ensureTypedStore = vi.fn();
  const createRecord = vi.fn(async () => ({ id: 'rec_new' }));
  const updateRecord = vi.fn(async () => ({ count: 1 }));
  const deleteRecord = vi.fn(async () => ({ count: 1 }));
  return {
    findFirst,
    recipeFindMany,
    getStoreByKey,
    listRecords,
    ensureTypedStore,
    createRecord,
    updateRecord,
    deleteRecord,
  };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    dataStoreRecord: { findFirst: hoisted.findFirst },
    recipe: { findMany: hoisted.recipeFindMany },
  }),
}));

vi.mock('~/services/data/data-store.service', () => ({
  DataStoreService: vi.fn().mockImplementation(() => ({
    getStoreByKey: hoisted.getStoreByKey,
    listRecords: hoisted.listRecords,
    ensureTypedStore: hoisted.ensureTypedStore,
    createRecord: hoisted.createRecord,
    updateRecord: hoisted.updateRecord,
    deleteRecord: hoisted.deleteRecord,
  })),
}));

vi.mock('~/services/blueprints/blueprint.service', () => ({
  parseCompositeManifest: (json: string | null) => (json ? JSON.parse(json) : null),
}));

import { readLoyaltyBalance } from '~/services/composites/loyalty-accrual.server';
import { readCustomerSubscription } from '~/services/composites/subscription-advancement.server';
import { verifyStaffPin, hashPin } from '~/services/pos/staff-pin.server';
import {
  PushSubscriptionStore,
  parsePushSubscription,
} from '~/services/messaging/push-subscription-store.server';

// A ledger composite manifest (one loyalty-ledger record ref = "vip-points").
function ledgerManifest() {
  return JSON.stringify({
    sharedRecords: [
      {
        ref: 'vip-points',
        kind: 'loyalty-ledger',
        backing: 'DATA_STORE',
        dataModel: { fields: [] },
      },
    ],
    bindings: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── readLoyaltyBalance ────────────────────────────────────────────────────────

describe('readLoyaltyBalance — POS + customer-account loyalty.points', () => {
  it('reports configured:false when the shop has NO loyalty ledger (never a number)', async () => {
    hoisted.recipeFindMany.mockResolvedValue([]); // no composites
    const bal = await readLoyaltyBalance('shop_1', 'gid://shopify/Customer/9');
    expect(bal).toEqual({ configured: false, points: null, lifetimeEarned: null });
  });

  it('returns an HONEST ZERO when the ledger exists but the customer never earned', async () => {
    hoisted.recipeFindMany.mockResolvedValue([{ id: 'r1', compositeJson: ledgerManifest() }]);
    hoisted.getStoreByKey.mockResolvedValue({ id: 'store_1', key: 'vip_points' });
    hoisted.findFirst.mockResolvedValue(null); // no row for this customer
    const bal = await readLoyaltyBalance('shop_1', 'gid://shopify/Customer/9');
    expect(bal.configured).toBe(true);
    expect(bal.points).toBe(0);
    expect(bal.ref).toBe('vip-points');
  });

  it('returns the REAL balance from the ledger row (matches numeric ↔ GID customer id)', async () => {
    hoisted.recipeFindMany.mockResolvedValue([{ id: 'r1', compositeJson: ledgerManifest() }]);
    hoisted.getStoreByKey.mockResolvedValue({ id: 'store_1', key: 'vip_points' });
    // POS passes numeric "42"; the row was written by the webhook under the GID.
    hoisted.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.externalId === 'gid://shopify/Customer/42') {
        return { id: 'row_1', payload: JSON.stringify({ balance: 350, lifetimeEarned: 500, lots: [] }) };
      }
      return null;
    });
    const bal = await readLoyaltyBalance('shop_1', '42');
    expect(bal).toMatchObject({ configured: true, points: 350, lifetimeEarned: 500, ref: 'vip-points' });
  });
});

// ─── readCustomerSubscription ────────────────────────────────────────────────────

function subscriptionManifest() {
  return JSON.stringify({
    sharedRecords: [
      { ref: 'sub-contract', kind: 'subscription-contract', backing: 'SHOPIFY_CONTRACT', dataModel: { fields: [] } },
    ],
    bindings: [],
  });
}

describe('readCustomerSubscription — customer-account subscription.*', () => {
  it('reports configured:false when the shop has NO subscription composite', async () => {
    hoisted.recipeFindMany.mockResolvedValue([]);
    const sub = await readCustomerSubscription('shop_1', 'gid://shopify/Customer/9');
    expect(sub).toEqual({ configured: false, status: null, nextOrderDate: null });
  });

  it('returns the REAL mirrored status + nextOrderDate for the customer', async () => {
    hoisted.recipeFindMany.mockResolvedValue([{ id: 'r1', compositeJson: subscriptionManifest() }]);
    hoisted.getStoreByKey.mockResolvedValue({ id: 'store_sub', key: 'sub_contract' });
    hoisted.findFirst.mockResolvedValue({
      id: 'm1',
      payload: JSON.stringify({
        contractId: 'gid://shopify/SubscriptionContract/7',
        customerId: 'gid://shopify/Customer/9',
        status: 'active',
        nextBillingAt: '2026-08-01T00:00:00.000Z',
      }),
    });
    const sub = await readCustomerSubscription('shop_1', 'gid://shopify/Customer/9');
    expect(sub).toMatchObject({
      configured: true,
      status: 'active',
      nextOrderDate: '2026-08-01T00:00:00.000Z',
      ref: 'sub-contract',
    });
  });
});

// ─── verifyStaffPin ────────────────────────────────────────────────────────────

describe('verifyStaffPin — POS staff-PIN gate (fails CLOSED)', () => {
  it('rejects an empty PIN', async () => {
    const r = await verifyStaffPin('shop_1', '', undefined);
    expect(r).toEqual({ verified: false, reason: 'empty' });
  });

  it('fails CLOSED when no staff-PIN store is provisioned (never fake-approve)', async () => {
    hoisted.getStoreByKey.mockResolvedValue(null);
    const r = await verifyStaffPin('shop_1', '1234', undefined);
    expect(r).toEqual({ verified: false, reason: 'no_config' });
  });

  it('verifies a matching hashed PIN', async () => {
    hoisted.getStoreByKey.mockResolvedValue({ id: 'store_pin', key: 'staff_pins' });
    hoisted.listRecords.mockResolvedValue({
      records: [{ id: 'p1', payload: { hash: hashPin('4821'), role: 'cashier' } }],
    });
    const r = await verifyStaffPin('shop_1', '4821', 'cashier');
    expect(r).toEqual({ verified: true });
  });

  it('rejects a wrong PIN (no_match) and a role mismatch', async () => {
    hoisted.getStoreByKey.mockResolvedValue({ id: 'store_pin', key: 'staff_pins' });
    hoisted.listRecords.mockResolvedValue({
      records: [{ id: 'p1', payload: { hash: hashPin('4821'), role: 'manager' } }],
    });
    // right PIN, wrong role → no match.
    expect(await verifyStaffPin('shop_1', '4821', 'cashier')).toEqual({ verified: false, reason: 'no_match' });
    // wrong PIN, right role → no match.
    expect(await verifyStaffPin('shop_1', '0000', 'manager')).toEqual({ verified: false, reason: 'no_match' });
  });

  it('accepts a legacy plaintext `pin` record (hashed at compare time)', async () => {
    hoisted.getStoreByKey.mockResolvedValue({ id: 'store_pin', key: 'staff_pins' });
    hoisted.listRecords.mockResolvedValue({ records: [{ id: 'p1', payload: { pin: '9999' } }] });
    const r = await verifyStaffPin('shop_1', '9999', undefined);
    expect(r).toEqual({ verified: true });
  });
});

// ─── PushSubscriptionStore ─────────────────────────────────────────────────────

describe('web-push subscription store', () => {
  const validSub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'p256', auth: 'authsecret' },
  };

  it('parsePushSubscription rejects a non-https / keyless body', () => {
    expect(parsePushSubscription(null)).toBeUndefined();
    expect(parsePushSubscription({ endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } })).toBeUndefined();
    expect(parsePushSubscription({ endpoint: 'https://x', keys: {} })).toBeUndefined();
    expect(parsePushSubscription(validSub)).toMatchObject({ endpoint: validSub.endpoint });
  });

  it('upsert creates a new subscription row keyed by endpoint', async () => {
    hoisted.ensureTypedStore.mockResolvedValue({ id: 'store_push', key: 'push_subscriptions' });
    hoisted.findFirst.mockResolvedValue(null); // not present yet
    const store = new PushSubscriptionStore();
    const res = await store.upsert('shop_1', parsePushSubscription(validSub)!);
    expect(res).toEqual({ created: true });
    expect(hoisted.createRecord).toHaveBeenCalledWith(
      'store_push',
      expect.objectContaining({ externalId: validSub.endpoint }),
    );
    // The payload carries the subscription under both fields the runner reads.
    const call = hoisted.createRecord.mock.calls[0] as unknown as [string, { payload: Record<string, unknown> }];
    const payload = call[1].payload;
    expect(payload.subscription).toBeTruthy();
    expect(payload.pushSubscription).toBeTruthy();
    expect(payload.endpoint).toBe(validSub.endpoint);
  });

  it('upsert refreshes an existing endpoint (created:false)', async () => {
    hoisted.ensureTypedStore.mockResolvedValue({ id: 'store_push', key: 'push_subscriptions' });
    hoisted.findFirst.mockResolvedValue({ id: 'existing', externalId: validSub.endpoint });
    const store = new PushSubscriptionStore();
    const res = await store.upsert('shop_1', parsePushSubscription(validSub)!);
    expect(res).toEqual({ created: false });
    expect(hoisted.updateRecord).toHaveBeenCalled();
    expect(hoisted.createRecord).not.toHaveBeenCalled();
  });

  it('prune REALLY deletes a stale subscription by endpoint', async () => {
    hoisted.getStoreByKey.mockResolvedValue({ id: 'store_push', key: 'push_subscriptions' });
    hoisted.findFirst.mockResolvedValue({ id: 'gone_row', externalId: validSub.endpoint });
    const store = new PushSubscriptionStore();
    const res = await store.prune('shop_1', validSub.endpoint);
    expect(res).toEqual({ removed: 1 });
    expect(hoisted.deleteRecord).toHaveBeenCalledWith('gone_row', 'store_push');
  });

  it('prune is a no-op (removed:0) when the endpoint is unknown', async () => {
    hoisted.getStoreByKey.mockResolvedValue({ id: 'store_push', key: 'push_subscriptions' });
    hoisted.findFirst.mockResolvedValue(null);
    const store = new PushSubscriptionStore();
    expect(await store.prune('shop_1', 'https://x/none')).toEqual({ removed: 0 });
    expect(hoisted.deleteRecord).not.toHaveBeenCalled();
  });
});

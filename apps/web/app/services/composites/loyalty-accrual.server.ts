/**
 * Loyalty accrual + expiry engine (Phase #4 · R3.6 — makes the loyalty-ledger
 * composite REAL, not modeled).
 *
 * R3.1 shipped the loyalty-ledger composite as `deferred:true`: the typed
 * DATA_STORE ledger + surfaces were built, but nothing ever wrote points into it.
 * This module wires the two halves of the earning engine:
 *
 *  1. ACCRUAL (`accrueForOrder`): on the existing order webhook/flow path
 *     (`orders/create`, already subscribed + deduped — see webhooks.tsx), credit
 *     points into the customer's ledger row. IDEMPOTENT: each ledger row carries a
 *     `lots[]` list of processed orders keyed by the order's Shopify GID, so a
 *     webhook REDELIVERY that re-invokes accrual for the same order is a no-op
 *     (mirrors the R3.5 park's idempotent-runId discipline). This is a SECOND line
 *     of defence on top of the webhook-level `WebhookEvent` dedup: even a
 *     same-shop double-invoke cannot double-accrue.
 *
 *  2. EXPIRY (`expireDuePoints`): an ABSOLUTE nightly sweep (driven by api.cron,
 *     alongside the R3.5 resume sweep) that ages out point lots older than the
 *     record's `expiryDays` policy — the "cron advancement" a ledger needs. Uses
 *     the same durable/cron substrate; no new scheduler.
 *
 * Reuse discipline (no reinvention):
 *  - the typed DATA_STORE ledger is the SAME store `provisionModuleDataStore`
 *    created at publish; the store key is derived by `compositeStoreKey(ref)` —
 *    the single source of truth shared with the resolver.
 *  - point math is a PURE function (`computeAccrual` / `applyExpiry`) so the
 *    engine is unit-tested without a shop.
 *
 * HONESTY FENCE (§5c): earning + expiry are real. REDEMPTION issuance — turning a
 * balance into a Shopify discount code or gift card — needs an Admin API mutation
 * the workflow connector does not yet expose (`discountCodeBasicCreate` /
 * `giftCardCreate`) plus the matching write scope. `redeemPoints` records the
 * intent + debits the balance idempotently and returns a `needsShopifyApi` marker;
 * it does NOT fake a code. That issuance is the documented scoped follow-up.
 */
import type { CompositeRecord } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import { compositeStoreKey } from './resolve-record.server';
import {
  findShopCompositeRecords,
  type ShopCompositeRecord,
} from './composite-registry.server';

// ─── Ledger payload shape (stored in DataStoreRecord.payload as JSON) ──────────

/** One earned lot — a dated block of points, so expiry can age lots independently. */
export type PointLot = {
  /** The Shopify order GID that earned this lot — the accrual idempotency key. */
  orderGid: string;
  points: number;
  /** ISO-8601 instant the lot was earned (drives expiry). */
  earnedAt: string;
  /** ISO-8601 instant the lot expires, or null when the policy has no expiry. */
  expiresAt: string | null;
};

/** The JSON document persisted per customer in the ledger DATA_STORE. */
export type LedgerPayload = {
  customerId: string;
  /** Current spendable balance (sum of unexpired, unredeemed lots). */
  balance: number;
  /** Lifetime earned (never decremented) — for tiering/analytics. */
  lifetimeEarned: number;
  lots: PointLot[];
  /** Redemption intents recorded (balance already debited); issuance is a follow-up. */
  redemptions?: Array<{ id: string; points: number; recordedAt: string; issued: boolean }>;
  updatedAt: string;
};

/** The accrual policy scalars read off the composite record's `dataModel`. */
export type LoyaltyPolicy = {
  /** Points earned per unit of order subtotal currency. Default 1. */
  pointsPerCurrency: number;
  /** Days until an earned lot expires; 0/absent ⇒ never expires. */
  expiryDays: number;
};

const DEFAULT_POLICY: LoyaltyPolicy = { pointsPerCurrency: 1, expiryDays: 0 };

// ─── Pure computation (unit-tested, no shop) ──────────────────────────────────

/** Read the loyalty policy off a composite record's dataModel default values. */
export function policyFromRecord(record: CompositeRecord): LoyaltyPolicy {
  const fields = record.dataModel?.fields ?? [];
  const get = (name: string): number | undefined => {
    const f = fields.find((x) => x.name === name);
    // Policy defaults ride on the field's `help` as `default:<n>` (the dataModel
    // schema has no value slot); absent ⇒ use the built-in default. Kept simple +
    // additive — a record with no policy fields earns 1pt/unit, never expires.
    if (!f?.help) return undefined;
    const m = f.help.match(/default:\s*([0-9]+(?:\.[0-9]+)?)/i);
    return m ? Number(m[1]) : undefined;
  };
  return {
    pointsPerCurrency: get('pointsPerCurrency') ?? DEFAULT_POLICY.pointsPerCurrency,
    expiryDays: get('expiryDays') ?? DEFAULT_POLICY.expiryDays,
  };
}

/** The subtotal an order earns on — prefer subtotal (pre-tax/shipping) when present. */
export function orderEarnableSubtotal(order: OrderPayload): number {
  const raw =
    firstNumeric(order.current_subtotal_price) ??
    firstNumeric(order.subtotal_price) ??
    firstNumeric(order.total_price) ??
    0;
  return raw > 0 ? raw : 0;
}

/**
 * Compute the accrual for one order against the current ledger, IDEMPOTENTLY.
 * Returns the new payload + whether a change was made. A repeat order GID (webhook
 * redelivery) returns `changed:false` with the payload untouched — the core
 * double-webhook guard, proven in isolation.
 */
export function computeAccrual(
  current: LedgerPayload | null,
  input: { customerId: string; orderGid: string; subtotal: number; policy: LoyaltyPolicy; now: Date },
): { payload: LedgerPayload; changed: boolean; pointsEarned: number } {
  const base: LedgerPayload = current ?? {
    customerId: input.customerId,
    balance: 0,
    lifetimeEarned: 0,
    lots: [],
    redemptions: [],
    updatedAt: input.now.toISOString(),
  };

  // Idempotency: if this order GID already earned a lot, do nothing.
  if (base.lots.some((l) => l.orderGid === input.orderGid)) {
    return { payload: base, changed: false, pointsEarned: 0 };
  }

  const pointsEarned = Math.floor(input.subtotal * input.policy.pointsPerCurrency);
  if (pointsEarned <= 0) {
    // Nothing to earn (zero/negative subtotal) — but still no double-processing.
    return { payload: base, changed: false, pointsEarned: 0 };
  }

  const expiresAt =
    input.policy.expiryDays > 0
      ? new Date(input.now.getTime() + input.policy.expiryDays * DAY_MS).toISOString()
      : null;

  const lot: PointLot = {
    orderGid: input.orderGid,
    points: pointsEarned,
    earnedAt: input.now.toISOString(),
    expiresAt,
  };

  const payload: LedgerPayload = {
    ...base,
    balance: base.balance + pointsEarned,
    lifetimeEarned: base.lifetimeEarned + pointsEarned,
    lots: [...base.lots, lot],
    updatedAt: input.now.toISOString(),
  };
  return { payload, changed: true, pointsEarned };
}

/**
 * Age out lots whose `expiresAt <= now`, deducting their still-live points from the
 * balance. Pure. Returns the new payload + how many points expired (0 ⇒ no change).
 */
export function applyExpiry(
  current: LedgerPayload,
  now: Date,
): { payload: LedgerPayload; expiredPoints: number; changed: boolean } {
  const nowMs = now.getTime();
  let expiredPoints = 0;
  const keptLots: PointLot[] = [];
  for (const lot of current.lots) {
    if (lot.expiresAt && new Date(lot.expiresAt).getTime() <= nowMs) {
      expiredPoints += lot.points;
    } else {
      keptLots.push(lot);
    }
  }
  if (expiredPoints === 0) {
    return { payload: current, expiredPoints: 0, changed: false };
  }
  const payload: LedgerPayload = {
    ...current,
    balance: Math.max(0, current.balance - expiredPoints),
    lots: keptLots,
    updatedAt: now.toISOString(),
  };
  return { payload, expiredPoints, changed: true };
}

// ─── Shop-scoped engine (DB-backed) ────────────────────────────────────────────

export type OrderPayload = {
  admin_graphql_api_id?: string;
  id?: number | string;
  customer?: { id?: number | string; admin_graphql_api_id?: string };
  current_subtotal_price?: unknown;
  subtotal_price?: unknown;
  total_price?: unknown;
  [key: string]: unknown;
};

export type AccrualOutcome = {
  ref: string;
  storeKey: string;
  accrued: boolean;
  pointsEarned: number;
  reason?: string;
};

/**
 * Accrue points for a paid order across every loyalty-ledger composite the shop
 * has published. Best-effort per ledger; a failure on one ledger is logged and
 * does not block others (mirrors the messaging fan-out discipline). Returns one
 * outcome per ledger for observability. Safe to call from the webhook path.
 */
export async function accrueForOrder(
  shopId: string,
  order: OrderPayload,
  deps: { service?: DataStoreService; now?: Date } = {},
): Promise<AccrualOutcome[]> {
  const now = deps.now ?? new Date();
  const service = deps.service ?? new DataStoreService();

  const orderGid = orderGidOf(order);
  const customerId = customerIdOf(order);
  const outcomes: AccrualOutcome[] = [];

  if (!orderGid || !customerId) {
    // No customer (guest checkout) or no order id → nothing to key accrual on.
    return outcomes;
  }

  const ledgers = await findShopCompositeRecords(shopId, 'loyalty-ledger');
  const subtotal = orderEarnableSubtotal(order);

  for (const ledger of ledgers) {
    try {
      const outcome = await accrueIntoLedger(service, shopId, ledger, {
        customerId,
        orderGid,
        subtotal,
        now,
      });
      outcomes.push(outcome);
    } catch (err) {
      logger.error('[loyalty] accrual failed for ledger', {
        shopId,
        ref: ledger.record.ref,
        ...safeErrorMeta(err),
      });
      outcomes.push({
        ref: ledger.record.ref,
        storeKey: compositeStoreKey(ledger.record.ref),
        accrued: false,
        pointsEarned: 0,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}

/** Accrue into one ledger store (find-or-create the customer row, idempotent). */
async function accrueIntoLedger(
  service: DataStoreService,
  shopId: string,
  ledger: ShopCompositeRecord,
  input: { customerId: string; orderGid: string; subtotal: number; now: Date },
): Promise<AccrualOutcome> {
  const storeKey = compositeStoreKey(ledger.record.ref);
  const store = await service.getStoreByKey(shopId, storeKey);
  if (!store) {
    return { ref: ledger.record.ref, storeKey, accrued: false, pointsEarned: 0, reason: 'ledger store not provisioned' };
  }

  const policy = policyFromRecord(ledger.record);
  const existing = await findCustomerRecord(store.id, input.customerId);
  const current = existing ? safeParseLedger(existing.payload) : null;

  const { payload, changed, pointsEarned } = computeAccrual(current, {
    customerId: input.customerId,
    orderGid: input.orderGid,
    subtotal: input.subtotal,
    policy,
    now: input.now,
  });

  if (!changed) {
    return { ref: ledger.record.ref, storeKey, accrued: false, pointsEarned: 0, reason: existing ? 'already accrued (idempotent)' : 'nothing to earn' };
  }

  if (existing) {
    await service.updateRecord(existing.id, store.id, {
      title: `Loyalty · ${input.customerId}`,
      payload,
    });
  } else {
    await service.createRecord(store.id, {
      externalId: input.customerId,
      customerId: input.customerId,
      title: `Loyalty · ${input.customerId}`,
      payload,
    });
  }

  return { ref: ledger.record.ref, storeKey, accrued: true, pointsEarned };
}

export type ExpiryOutcome = {
  ref: string;
  storeKey: string;
  rowsSwept: number;
  rowsExpired: number;
  pointsExpired: number;
};

/**
 * Absolute expiry sweep for one shop's loyalty ledgers: age out due lots across
 * every customer row. Called by the nightly cron (bounded per shop). Idempotent —
 * a lot is removed once; a second sweep finds nothing to expire.
 */
export async function expireDuePoints(
  shopId: string,
  deps: { service?: DataStoreService; now?: Date; maxRowsPerLedger?: number } = {},
): Promise<ExpiryOutcome[]> {
  const now = deps.now ?? new Date();
  const service = deps.service ?? new DataStoreService();
  const prisma = getPrisma();
  const cap = Math.max(1, Math.min(deps.maxRowsPerLedger ?? 1000, 5000));

  const ledgers = await findShopCompositeRecords(shopId, 'loyalty-ledger');
  const outcomes: ExpiryOutcome[] = [];

  for (const ledger of ledgers) {
    const policy = policyFromRecord(ledger.record);
    const storeKey = compositeStoreKey(ledger.record.ref);
    if (policy.expiryDays <= 0) {
      // Policy has no expiry → nothing to sweep for this ledger.
      outcomes.push({ ref: ledger.record.ref, storeKey, rowsSwept: 0, rowsExpired: 0, pointsExpired: 0 });
      continue;
    }
    const store = await service.getStoreByKey(shopId, storeKey);
    if (!store) {
      outcomes.push({ ref: ledger.record.ref, storeKey, rowsSwept: 0, rowsExpired: 0, pointsExpired: 0 });
      continue;
    }

    const rows = await prisma.dataStoreRecord.findMany({
      where: { dataStoreId: store.id },
      take: cap,
      orderBy: { updatedAt: 'asc' },
    });

    let rowsExpired = 0;
    let pointsExpired = 0;
    for (const row of rows) {
      const current = safeParseLedger(row.payload);
      if (!current) continue;
      const { payload, expiredPoints, changed } = applyExpiry(current, now);
      if (!changed) continue;
      await service.updateRecord(row.id, store.id, { payload });
      rowsExpired += 1;
      pointsExpired += expiredPoints;
    }

    outcomes.push({ ref: ledger.record.ref, storeKey, rowsSwept: rows.length, rowsExpired, pointsExpired });
  }
  return outcomes;
}

export type RedemptionResult = {
  ref: string;
  ok: boolean;
  points: number;
  redemptionId?: string;
  /** True: the balance was debited + intent recorded, but issuing the actual
   *  Shopify discount code / gift card is a scoped follow-up (no API reached). */
  needsShopifyApi: boolean;
  reason?: string;
};

/**
 * Redeem `points` from a customer's ledger. IDEMPOTENT balance debit + recorded
 * intent. HONESTY FENCE: this does NOT mint a Shopify discount/gift card — that
 * mutation (`discountCodeBasicCreate`/`giftCardCreate`) + scope is the documented
 * scoped follow-up. Returns `needsShopifyApi:true` so the caller can surface an
 * honest "issued outside Shopify" state rather than a faked code.
 */
export async function redeemPoints(
  shopId: string,
  input: { ref: string; customerId: string; points: number },
  deps: { service?: DataStoreService; now?: Date } = {},
): Promise<RedemptionResult> {
  const now = deps.now ?? new Date();
  const service = deps.service ?? new DataStoreService();
  const storeKey = compositeStoreKey(input.ref);

  if (input.points <= 0) {
    return { ref: input.ref, ok: false, points: 0, needsShopifyApi: false, reason: 'points must be positive' };
  }

  const store = await service.getStoreByKey(shopId, storeKey);
  if (!store) return { ref: input.ref, ok: false, points: input.points, needsShopifyApi: false, reason: 'ledger store not provisioned' };

  const existing = await findCustomerRecord(store.id, input.customerId);
  const current = existing ? safeParseLedger(existing.payload) : null;
  if (!current || current.balance < input.points) {
    return { ref: input.ref, ok: false, points: input.points, needsShopifyApi: false, reason: 'insufficient balance' };
  }

  const redemptionId = `redeem_${input.customerId}_${now.getTime()}`;
  const payload: LedgerPayload = {
    ...current,
    balance: current.balance - input.points,
    redemptions: [
      ...(current.redemptions ?? []),
      { id: redemptionId, points: input.points, recordedAt: now.toISOString(), issued: false },
    ],
    updatedAt: now.toISOString(),
  };
  await service.updateRecord(existing!.id, store.id, { payload });

  // The debit is real + idempotent; the Shopify issuance is the scoped follow-up.
  return { ref: input.ref, ok: true, points: input.points, redemptionId, needsShopifyApi: true };
}

export type LoyaltyBalance = {
  /** True when a loyalty ledger is provisioned for this shop (a store exists). */
  configured: boolean;
  /** The customer's current spendable balance, or null when they have no ledger row yet. */
  points: number | null;
  /** Lifetime earned (never decremented), or null when no row exists. */
  lifetimeEarned: number | null;
  /** The composite record ref the balance was read from (first ledger, when present). */
  ref?: string;
};

/**
 * Read a customer's loyalty balance across the shop's published loyalty ledgers.
 * REAL read from the app-owned DATA_STORE the accrual engine writes — never a
 * fabricated value:
 *  - No ledger provisioned → `{ configured:false, points:null, lifetimeEarned:null }`.
 *  - Ledger exists but this customer has never earned → `{ configured:true, points:0 }`
 *    (an honest zero: the ledger is real, the customer simply has no points).
 *  - Ledger + a row → the row's real balance.
 *
 * Matches on the ledger row key the accrual path wrote (`customerIdOf`): the
 * customer's Shopify GID or bare numeric id. We try the id as given AND its
 * GID/numeric siblings so a POS-supplied numeric id resolves the same row a
 * webhook-supplied GID created.
 */
export async function readLoyaltyBalance(
  shopId: string,
  customerId: string,
  deps: { service?: DataStoreService } = {},
): Promise<LoyaltyBalance> {
  const service = deps.service ?? new DataStoreService();
  const ledgers = await findShopCompositeRecords(shopId, 'loyalty-ledger');
  if (ledgers.length === 0) {
    return { configured: false, points: null, lifetimeEarned: null };
  }

  const candidates = customerIdCandidates(customerId);
  for (const ledger of ledgers) {
    const storeKey = compositeStoreKey(ledger.record.ref);
    const store = await service.getStoreByKey(shopId, storeKey);
    if (!store) continue;

    for (const key of candidates) {
      const row = await findCustomerRecord(store.id, key);
      if (!row) continue;
      const parsed = safeParseLedger(row.payload);
      if (!parsed) continue;
      return {
        configured: true,
        points: parsed.balance,
        lifetimeEarned: parsed.lifetimeEarned,
        ref: ledger.record.ref,
      };
    }
  }

  // A ledger is provisioned but this customer has never earned — honest zero.
  return { configured: true, points: 0, lifetimeEarned: 0, ref: ledgers[0]?.record.ref };
}

/** The id forms a ledger row might be keyed by: as-given, its numeric tail, and its GID. */
function customerIdCandidates(customerId: string): string[] {
  const out = new Set<string>();
  const raw = customerId.trim();
  if (raw) out.add(raw);
  const numeric = raw.match(/\/(\d+)(?:[?#].*)?$/)?.[1] ?? (/^\d+$/.test(raw) ? raw : undefined);
  if (numeric) {
    out.add(numeric);
    out.add(`gid://shopify/Customer/${numeric}`);
  }
  return [...out];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

async function findCustomerRecord(dataStoreId: string, customerId: string) {
  const prisma = getPrisma();
  // The ledger row is keyed by externalId=customerId; fall back to customerId col.
  return (
    (await prisma.dataStoreRecord.findFirst({ where: { dataStoreId, externalId: customerId } })) ??
    (await prisma.dataStoreRecord.findFirst({ where: { dataStoreId, customerId } }))
  );
}

function safeParseLedger(raw: string): LedgerPayload | null {
  try {
    const obj = JSON.parse(raw) as Partial<LedgerPayload>;
    if (typeof obj !== 'object' || obj === null) return null;
    return {
      customerId: String(obj.customerId ?? ''),
      balance: typeof obj.balance === 'number' ? obj.balance : 0,
      lifetimeEarned: typeof obj.lifetimeEarned === 'number' ? obj.lifetimeEarned : 0,
      lots: Array.isArray(obj.lots) ? (obj.lots as PointLot[]) : [],
      redemptions: Array.isArray(obj.redemptions) ? obj.redemptions : [],
      updatedAt: String(obj.updatedAt ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

/** The order's Shopify GID — the accrual idempotency anchor. */
export function orderGidOf(order: OrderPayload): string | null {
  if (typeof order.admin_graphql_api_id === 'string' && order.admin_graphql_api_id) return order.admin_graphql_api_id;
  if (order.id != null) return `gid://shopify/Order/${order.id}`;
  return null;
}

/** The order's customer id (string) — the ledger row key. */
export function customerIdOf(order: OrderPayload): string | null {
  const c = order.customer;
  if (!c) return null;
  if (typeof c.admin_graphql_api_id === 'string' && c.admin_graphql_api_id) return c.admin_graphql_api_id;
  if (c.id != null) return String(c.id);
  return null;
}

function firstNumeric(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * POS loyalty app-proxy endpoint (build #16/#22 — makes LOYALTY_READ / LOYALTY_WRITE
 * and the `loyalty.*` bindings resolve for REAL).
 *
 * The generic POS block (extensions/superapp-pos-block/src/posBehavior.js) reads and
 * writes the customer's loyalty balance through its configured `appProxyPath`
 * (normalized to `/api/pos/loyalty` by pos-config.server.ts). It authenticates with a
 * POS session token (App Authentication) — verified here via `authenticate.public.pos`.
 *
 *  - GET  → LOYALTY_READ: return the customer's real balance from the app-owned
 *           loyalty-ledger DATA_STORE (the same store the accrual engine writes).
 *           No ledger provisioned → honest `{ configured:false, points:null }`.
 *           No customer context   → `{ points:null }` (never a fabricated number).
 *  - POST → LOYALTY_WRITE: accrue or redeem points against that ledger. The op is
 *           derived from the module's declared intent (path/action) + an explicit
 *           `op`/`points` when the caller supplies one. A redeem with no amount, or a
 *           write with no resolvable customer, returns an honest non-mutating result —
 *           NEVER a faked accrual.
 *
 * HONESTY FENCE (§5c, mirrored from loyalty-accrual.server.ts): earning + the balance
 * debit are real; turning a redeemed balance into a Shopify discount code / gift card
 * is a scoped Shopify-API follow-up — `redeemPoints` returns `needsShopifyApi:true`
 * and this route surfaces it rather than minting a fake code.
 */
import { json } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { withApiLogging } from '~/services/observability/api-log.service';
import { authenticatePos } from '~/services/pos/pos-auth.server';
import { readLoyaltyBalance, redeemPoints } from '~/services/composites/loyalty-accrual.server';
import { findShopCompositeRecords } from '~/services/composites/composite-registry.server';

/** LOYALTY_READ — resolve the customer's real points balance. */
export async function loader({ request }: LoaderFunctionArgs) {
  const { shopId, cors } = await authenticatePos(request);
  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: '/api/pos/loyalty', shopId: shopId ?? undefined },
    async () => {
      if (!shopId) return cors(json({ configured: false, points: null }, { status: 200 }));

      const url = new URL(request.url);
      const customerId =
        url.searchParams.get('customerId') ?? url.searchParams.get('customer_id') ?? '';
      if (!customerId) {
        // No customer on this surface (e.g. a guest sale) — honest empty, never a number.
        return cors(json({ configured: true, points: null, reason: 'no_customer' }));
      }

      const balance = await readLoyaltyBalance(shopId, customerId);
      return cors(
        json({
          configured: balance.configured,
          points: balance.points,
          lifetimeEarned: balance.lifetimeEarned,
          ref: balance.ref,
        }),
      );
    },
  );
}

type LoyaltyWriteBody = {
  action?: string;
  op?: string;
  customerId?: string | number;
  orderId?: string | number;
  points?: number | string;
  ref?: string;
  actionConfig?: Record<string, unknown>;
};

/** LOYALTY_WRITE — accrue or redeem points against the ledger. */
export async function action({ request }: ActionFunctionArgs) {
  const { shopId, cors } = await authenticatePos(request);
  return withApiLogging(
    {
      actor: 'APP_PROXY',
      method: request.method,
      path: '/api/pos/loyalty',
      shopId: shopId ?? undefined,
    },
    async () => {
      if (!shopId) return cors(json({ ok: false, reason: 'shop_unknown' }, { status: 404 }));

      const body = ((await request.json().catch(() => ({}))) ?? {}) as LoyaltyWriteBody;
      const customerId = body.customerId != null ? String(body.customerId) : '';
      if (!customerId) {
        // No customer to key the ledger row on — refuse honestly rather than fake a write.
        return cors(json({ ok: false, reason: 'no_customer' }, { status: 200 }));
      }

      // Resolve which loyalty ledger to act on (first published, or an explicit ref).
      const ledgers = await findShopCompositeRecords(shopId, 'loyalty-ledger');
      const firstLedger = ledgers[0];
      if (!firstLedger) {
        return cors(json({ ok: false, reason: 'no_ledger', configured: false }, { status: 200 }));
      }
      const ref =
        (body.ref && ledgers.find((l) => l.record.ref === body.ref)?.record.ref) ??
        firstLedger.record.ref;

      const op = resolveOp(body);
      const points = parsePoints(body.points ?? body.actionConfig?.points ?? body.actionConfig?.discountAmount);

      if (op === 'redeem') {
        if (points == null || points <= 0) {
          // A redeem needs a real amount; without one we do NOT guess or fake a debit.
          return cors(json({ ok: false, op: 'redeem', reason: 'points_required' }, { status: 200 }));
        }
        const result = await redeemPoints(shopId, { ref, customerId, points });
        return cors(
          json({
            ok: result.ok,
            op: 'redeem',
            points: result.points,
            redemptionId: result.redemptionId,
            // Honest fence: the debit is real; Shopify issuance is a scoped follow-up.
            needsShopifyApi: result.needsShopifyApi,
            reason: result.reason,
          }),
        );
      }

      // accrue: a manual in-store award needs an explicit positive amount. Order-based
      // accrual runs on the webhook path (real order subtotal) — not from an
      // unauthenticated points value — so a POS accrue with no amount is an honest no-op.
      if (points == null || points <= 0) {
        return cors(
          json({ ok: false, op: 'accrue', reason: 'points_required' }, { status: 200 }),
        );
      }
      const result = await accrueManual(shopId, ref, customerId, points, body.orderId);
      return cors(json(result));
    },
  );
}

/** Derive the write op from an explicit `op`, else the declared action/path intent. */
function resolveOp(body: LoyaltyWriteBody): 'accrue' | 'redeem' {
  const explicit = String(body.op ?? '').toLowerCase();
  if (explicit === 'redeem' || explicit === 'accrue') return explicit;
  const hint = `${body.action ?? ''} ${JSON.stringify(body.actionConfig ?? {})}`.toLowerCase();
  if (/redeem|redemption|spend|debit/.test(hint)) return 'redeem';
  return 'accrue';
}

function parsePoints(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace('%', '').trim());
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/**
 * Record a manual in-store points award into the ledger (idempotent per synthetic
 * award id). Reuses the SAME ledger store + payload shape the accrual engine uses so
 * a manual award and an order-earned lot live in one place. Real credit — no fake.
 */
async function accrueManual(
  shopId: string,
  ref: string,
  customerId: string,
  points: number,
  orderId: string | number | undefined,
): Promise<{ ok: boolean; op: 'accrue'; points: number; reason?: string }> {
  const { compositeStoreKey } = await import('~/services/composites/resolve-record.server');
  const { DataStoreService } = await import('~/services/data/data-store.service');
  const service = new DataStoreService();
  const storeKey = compositeStoreKey(ref);
  const store = await service.getStoreByKey(shopId, storeKey);
  if (!store) return { ok: false, op: 'accrue', points, reason: 'ledger store not provisioned' };

  const { getPrisma } = await import('~/db.server');
  const prisma = getPrisma();
  const row =
    (await prisma.dataStoreRecord.findFirst({ where: { dataStoreId: store.id, externalId: customerId } })) ??
    (await prisma.dataStoreRecord.findFirst({ where: { dataStoreId: store.id, customerId } }));

  const now = new Date();
  const awardId = orderId ? `pos-order-${orderId}` : `pos-award-${now.getTime()}`;
  const current = row ? safeLedger(row.payload) : null;

  // Idempotency: a repeat award id (e.g. same order) does not double-credit.
  if (current?.lots?.some((l) => l.orderGid === awardId)) {
    return { ok: false, op: 'accrue', points, reason: 'already_awarded' };
  }

  const base = current ?? { customerId, balance: 0, lifetimeEarned: 0, lots: [], redemptions: [], updatedAt: now.toISOString() };
  const payload = {
    ...base,
    balance: base.balance + points,
    lifetimeEarned: base.lifetimeEarned + points,
    lots: [...base.lots, { orderGid: awardId, points, earnedAt: now.toISOString(), expiresAt: null }],
    updatedAt: now.toISOString(),
  };

  if (row) {
    await service.updateRecord(row.id, store.id, { title: `Loyalty · ${customerId}`, payload });
  } else {
    await service.createRecord(store.id, { externalId: customerId, customerId, title: `Loyalty · ${customerId}`, payload });
  }
  return { ok: true, op: 'accrue', points };
}

type MinimalLedger = {
  customerId: string;
  balance: number;
  lifetimeEarned: number;
  lots: Array<{ orderGid: string; points: number; earnedAt: string; expiresAt: string | null }>;
  redemptions?: Array<{ id: string; points: number; recordedAt: string; issued: boolean }>;
  updatedAt: string;
};

function safeLedger(raw: string): MinimalLedger | null {
  try {
    const o = JSON.parse(raw) as Partial<MinimalLedger>;
    if (!o || typeof o !== 'object') return null;
    return {
      customerId: String(o.customerId ?? ''),
      balance: typeof o.balance === 'number' ? o.balance : 0,
      lifetimeEarned: typeof o.lifetimeEarned === 'number' ? o.lifetimeEarned : 0,
      lots: Array.isArray(o.lots) ? o.lots : [],
      redemptions: Array.isArray(o.redemptions) ? o.redemptions : [],
      updatedAt: String(o.updatedAt ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

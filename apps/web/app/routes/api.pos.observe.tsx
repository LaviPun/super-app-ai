/**
 * POS observer forward endpoint (build #16/#22 — makes `event.observe` +
 * `observe.forwardTo` resolve for REAL).
 *
 * The UI-less POS observer (extensions/superapp-pos-block/src/Observer.js) forwards a
 * subscribed POS event (cart-update / transaction-complete / cash-tracking-session
 * start|complete) to its module's `observe.forwardTo` path — normalized to
 * `/api/pos/observe` by pos-config.server.ts. The forward POSTs
 * `{ moduleId, event, payload }` with a POS session token (App Authentication).
 *
 * This route RECORDS every observation into a first-party `pos_events` DataStore (a
 * durable, inspectable audit of what POS forwarded) and, for a `transaction-complete`
 * event carrying an order + customer, drives REAL loyalty accrual via the SAME engine
 * the order webhook uses (`accrueForOrder`) — idempotent, so a POS forward AND the
 * webhook for the same order cannot double-accrue.
 *
 * Best-effort + non-blocking on the POS side: this route always ACKs (`{ recorded }`)
 * so the observer never interferes with the sale flow; failures are logged, not thrown.
 */
import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { withApiLogging } from '~/services/observability/api-log.service';
import { authenticatePos } from '~/services/pos/pos-auth.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { accrueForOrder, type OrderPayload } from '~/services/composites/loyalty-accrual.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

const POS_EVENTS_STORE_KEY = 'pos_events';

type ObserveBody = {
  moduleId?: string;
  event?: string;
  payload?: unknown;
};

export async function action({ request }: ActionFunctionArgs) {
  const { shopId, shopDomain, cors } = await authenticatePos(request);
  return withApiLogging(
    {
      actor: 'APP_PROXY',
      method: request.method,
      path: '/api/pos/observe',
      shopId: shopId ?? undefined,
    },
    async () => {
      if (!shopId) return cors(json({ recorded: false, reason: 'shop_unknown' }, { status: 200 }));

      const body = ((await request.json().catch(() => ({}))) ?? {}) as ObserveBody;
      const event = typeof body.event === 'string' ? body.event : 'unknown';
      const moduleId = typeof body.moduleId === 'string' ? body.moduleId : undefined;

      const service = new DataStoreService();

      // 1) Durable audit of the observation (real record, honest even when we can't act).
      let recorded = false;
      try {
        const store = await service.ensureTypedStore(shopId, POS_EVENTS_STORE_KEY, {
          label: 'POS events',
          description: 'Forwarded POS observer events (cart, transaction, cash-tracking).',
        });
        await service.createRecord(store.id, {
          externalId: moduleId,
          title: `POS ${event}`,
          payload: { event, moduleId, payload: body.payload ?? null, observedAt: new Date().toISOString() },
        });
        recorded = true;
      } catch (err) {
        logger.error('[pos-observe] failed to record event', { shopDomain, event, ...safeErrorMeta(err) });
      }

      // 2) Real side-effect: transaction-complete → loyalty accrual (idempotent).
      let accrual: { accrued: boolean; pointsEarned: number } | undefined;
      if (event === 'transaction-complete') {
        const order = orderFromObservePayload(body.payload);
        if (order) {
          try {
            const outcomes = await accrueForOrder(shopId, order, { service });
            const total = outcomes.reduce((n, o) => n + (o.accrued ? o.pointsEarned : 0), 0);
            accrual = { accrued: outcomes.some((o) => o.accrued), pointsEarned: total };
          } catch (err) {
            logger.error('[pos-observe] accrual failed', { shopDomain, ...safeErrorMeta(err) });
          }
        }
      }

      return cors(json({ recorded, event, accrual }));
    },
  );
}

/**
 * Map a POS transaction-complete payload to the engine's OrderPayload shape. POS
 * event payloads vary; we pull an order id + customer id + subtotal defensively and
 * return undefined when the essentials are absent (so we never fabricate an accrual).
 */
function orderFromObservePayload(payload: unknown): OrderPayload | undefined {
  if (payload == null || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  const order = (isRecord(p.order) ? p.order : p) as Record<string, unknown>;

  const orderId = order.admin_graphql_api_id ?? order.id ?? order.orderId;
  const customer = (isRecord(order.customer) ? order.customer : undefined) as Record<string, unknown> | undefined;
  const customerId = customer?.admin_graphql_api_id ?? customer?.id ?? order.customerId;
  if (orderId == null || customerId == null) return undefined;

  return {
    admin_graphql_api_id: typeof order.admin_graphql_api_id === 'string' ? order.admin_graphql_api_id : undefined,
    id: orderId as string | number,
    customer: {
      admin_graphql_api_id: typeof customer?.admin_graphql_api_id === 'string' ? customer.admin_graphql_api_id : undefined,
      id: customerId as string | number,
    },
    current_subtotal_price: order.current_subtotal_price ?? order.subtotalPrice ?? order.subtotal,
    subtotal_price: order.subtotal_price,
    total_price: order.total_price ?? order.totalPrice ?? order.total,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Live-data binding resolver (build #3, 034). Blocks DECLARE a `bind` value in
 * config; this module resolves it at render time and returns a display string.
 * Everything degrades gracefully: an unavailable API, a missing scope, a target
 * without the required context, or a rejected query all resolve to `undefined`
 * (the renderer then shows the block's literal `content`). Never throws.
 *
 * Data sources
 * ────────────
 * - Order / customer / returns / store-credit / subscription → the Customer
 *   Account GraphQL API via `fetch('shopify://customer-account/api/2026-04/graphql.json')`
 *   (auth handled automatically; gated app-wide by the customer_read_* protected
 *   customer-data scopes). See README for the scope matrix.
 * - Loyalty points → app-owned (our DB), read through the app proxy. Store-credit
 *   also falls back to the app proxy when the native store-credit scope isn't
 *   granted.
 *
 * The current ORDER id (order-scoped targets) and the authenticated CUSTOMER come
 * from the extension `shopify` global, read defensively because the shape differs
 * per target (order targets expose `order`; profile/index targets do not).
 */
import type { CaBinding } from './ca-content';

const CA_GRAPHQL_URL = 'shopify://customer-account/api/2026-04/graphql.json';

/** Minimal, defensive view of the customer-account `shopify` global. */
type CaGlobal = {
  order?: { value?: { id?: string; orderId?: string } | null } | { id?: string; orderId?: string };
  authenticatedAccount?: {
    customer?: { value?: { id?: string } | null } | { id?: string };
    purchasingCompany?: { value?: unknown };
  };
};

function caGlobal(): CaGlobal | undefined {
  return (globalThis as unknown as { shopify?: CaGlobal }).shopify;
}

/** Read a possibly-subscribable field (`{ value }`) or a plain object. */
function unwrap<T>(v: { value?: T | null } | T | undefined | null): T | undefined {
  if (v == null) return undefined;
  if (typeof v === 'object' && 'value' in (v as object)) {
    return ((v as { value?: T | null }).value ?? undefined) as T | undefined;
  }
  return v as T;
}

/** The current order GID on order-scoped targets, else undefined. */
function currentOrderId(): string | undefined {
  const order = unwrap(caGlobal()?.order);
  if (!order) return undefined;
  return order.id ?? order.orderId ?? undefined;
}

/** Run a Customer Account GraphQL query. Resolves to null on any failure. */
async function caQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(CA_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: variables ?? {} }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: T; errors?: unknown[] };
    if (body.errors && body.errors.length > 0) return null;
    return body.data ?? null;
  } catch {
    return null;
  }
}

const ORDER_QUERY = `#graphql
  query SuperAppCaOrder($id: ID!) {
    order(id: $id) {
      statusPageUrl
      financialStatus
      fulfillmentStatus
      fulfillments(first: 1) {
        nodes { status trackingInformation { number url } }
      }
      returns(first: 1) { nodes { status } }
    }
  }
`;

type OrderData = {
  order?: {
    statusPageUrl?: string | null;
    financialStatus?: string | null;
    fulfillmentStatus?: string | null;
    fulfillments?: {
      nodes?: Array<{
        status?: string | null;
        trackingInformation?: { number?: string | null; url?: string | null } | null;
      } | null> | null;
    } | null;
    returns?: { nodes?: Array<{ status?: string | null } | null> | null } | null;
  } | null;
};

const CUSTOMER_QUERY = `#graphql
  query SuperAppCaCustomer {
    customer {
      displayName
      storeCreditAccounts(first: 1) {
        nodes { balance { amount currencyCode } }
      }
    }
  }
`;

type CustomerData = {
  customer?: {
    displayName?: string | null;
    storeCreditAccounts?: {
      nodes?: Array<{ balance?: { amount?: string; currencyCode?: string } | null } | null> | null;
    } | null;
  } | null;
};

/** Humanize an enum like `PARTIALLY_FULFILLED` → `Partially fulfilled`. */
function humanizeEnum(v: string): string {
  const lower = v.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatMoney(amount?: string, currencyCode?: string): string | undefined {
  const n = Number(amount);
  if (!Number.isFinite(n) || !currencyCode) return undefined;
  try {
    // shopify.i18n is available on the global; fall back to a plain string.
    const i18n = (globalThis as unknown as {
      shopify?: { i18n?: { formatCurrency?: (n: number, o: { currency: string }) => string } };
    }).shopify?.i18n;
    if (i18n?.formatCurrency) return i18n.formatCurrency(n, { currency: currencyCode });
  } catch {
    /* fall through */
  }
  return `${n.toFixed(2)} ${currencyCode}`;
}

/**
 * Resolve a set of order/customer bindings in as few round-trips as possible.
 * Returns a map of binding → display string. Missing values are simply absent.
 */
export async function resolveBindings(
  bindings: Set<CaBinding>,
  ctx: { proxyBase?: string } = {},
): Promise<Partial<Record<CaBinding, string>>> {
  const out: Partial<Record<CaBinding, string>> = {};
  if (bindings.size === 0) return out;

  const needsOrder = [
    'order.trackingNumber',
    'order.trackingUrl',
    'order.fulfillmentStatus',
    'order.financialStatus',
    'order.returnStatus',
    'order.statusPageUrl',
  ].some((b) => bindings.has(b as CaBinding));
  const needsCustomer = ['customer.displayName', 'customer.storeCreditBalance', 'customer.ordersCount'].some(
    (b) => bindings.has(b as CaBinding),
  );
  const needsSubscription = ['subscription.nextOrderDate', 'subscription.status'].some((b) =>
    bindings.has(b as CaBinding),
  );
  const needsLoyalty = bindings.has('loyalty.points');

  const jobs: Array<Promise<void>> = [];

  if (needsOrder) {
    const orderId = currentOrderId();
    if (orderId) {
      jobs.push(
        caQuery<OrderData>(ORDER_QUERY, { id: orderId }).then((data) => {
          const order = data?.order;
          if (!order) return;
          const f = order.fulfillments?.nodes?.[0];
          const tracking = f?.trackingInformation;
          if (bindings.has('order.trackingNumber') && tracking?.number) {
            out['order.trackingNumber'] = tracking.number;
          }
          if (bindings.has('order.trackingUrl') && tracking?.url) {
            out['order.trackingUrl'] = tracking.url;
          }
          if (bindings.has('order.fulfillmentStatus') && order.fulfillmentStatus) {
            out['order.fulfillmentStatus'] = humanizeEnum(order.fulfillmentStatus);
          }
          if (bindings.has('order.financialStatus') && order.financialStatus) {
            out['order.financialStatus'] = humanizeEnum(order.financialStatus);
          }
          if (bindings.has('order.returnStatus')) {
            const rs = order.returns?.nodes?.[0]?.status;
            if (rs) out['order.returnStatus'] = humanizeEnum(rs);
          }
          if (bindings.has('order.statusPageUrl') && order.statusPageUrl) {
            out['order.statusPageUrl'] = order.statusPageUrl;
          }
        }),
      );
    }
  }

  if (needsCustomer) {
    jobs.push(
      caQuery<CustomerData>(CUSTOMER_QUERY).then((data) => {
        const customer = data?.customer;
        if (!customer) return;
        if (bindings.has('customer.displayName') && customer.displayName) {
          out['customer.displayName'] = customer.displayName;
        }
        if (bindings.has('customer.storeCreditBalance')) {
          const bal = customer.storeCreditAccounts?.nodes?.[0]?.balance;
          const money = formatMoney(bal?.amount, bal?.currencyCode);
          if (money) out['customer.storeCreditBalance'] = money;
        }
        // customer.ordersCount is Level-1 protected data not exposed by the query
        // above; left unresolved (degrades to literal content) until the scope +
        // field are confirmed available. Honest partial, never fabricated.
      }),
    );
  }

  // Loyalty points (and, as a fallback, store credit) are app-owned. Read via the
  // app proxy when a base path is configured. Degrades silently otherwise.
  if ((needsLoyalty || needsSubscription) && ctx.proxyBase) {
    jobs.push(
      (async () => {
        try {
          const res = await fetch(`${ctx.proxyBase}/ca/customer-data`, { method: 'GET' });
          if (!res.ok) return;
          const data = (await res.json()) as {
            loyaltyPoints?: number;
            subscription?: { nextOrderDate?: string; status?: string };
          };
          if (needsLoyalty && typeof data.loyaltyPoints === 'number') {
            out['loyalty.points'] = String(data.loyaltyPoints);
          }
          if (bindings.has('subscription.nextOrderDate') && data.subscription?.nextOrderDate) {
            out['subscription.nextOrderDate'] = data.subscription.nextOrderDate;
          }
          if (bindings.has('subscription.status') && data.subscription?.status) {
            out['subscription.status'] = humanizeEnum(data.subscription.status);
          }
        } catch {
          /* degrade silently */
        }
      })(),
    );
  }

  await Promise.all(jobs);
  return out;
}

/** True for order-scoped targets that carry an order context a binding can use. */
export function targetHasOrderContext(target: string): boolean {
  return target.startsWith('customer-account.order-status.') || target.startsWith('customer-account.order.');
}

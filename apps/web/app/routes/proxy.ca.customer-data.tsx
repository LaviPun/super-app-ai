/**
 * Customer-account app-proxy data endpoint (build #3, 034 — makes the
 * `loyalty.points` / `subscription.nextOrderDate` / `subscription.status` bindings
 * resolve for REAL).
 *
 * The customer-account extension resolves order/customer bindings via the Customer
 * Account GraphQL API, but LOYALTY POINTS and SUBSCRIPTION state are APP-OWNED (our
 * DB), so the `ca-bindings` resolver reads them through the storefront app proxy:
 * `GET {proxyBase}/ca/customer-data` (see ca-bindings.ts §proxyBase branch). The
 * extension supplies `proxyBase = https://{shop}/apps/superapp`, so this route is
 * served at `/apps/superapp/ca/customer-data` → `/proxy/ca/customer-data`.
 *
 * Auth: the storefront App Proxy signs the request (HMAC) and injects
 * `logged_in_customer_id` for a logged-in shopper — the trust boundary. We take the
 * customer from the SIGNED param, never a spoofable body.
 *
 * Response shape (EXACT contract ca-bindings.ts parses):
 *   { loyaltyPoints?: number; subscription?: { nextOrderDate?: string; status?: string } }
 * Every field is omitted (not zeroed/faked) when there is no real value — an honest
 * empty degrades the binding to the block's literal content, never a fabricated value.
 */
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { readLoyaltyBalance } from '~/services/composites/loyalty-accrual.server';
import { readCustomerSubscription } from '~/services/composites/subscription-advancement.server';

type CaCustomerData = {
  loyaltyPoints?: number;
  subscription?: { nextOrderDate?: string; status?: string };
};

/**
 * Customer-account extensions run in a null-origin Web Worker, so the app response
 * MUST carry `Access-Control-Allow-Origin: *` (per Shopify's network-access docs) or
 * the fetch is blocked. This wrapper stamps that (plus the cache hint) on every reply.
 */
function caJson(data: CaCustomerData, init: { status?: number; cache?: boolean } = {}): Response {
  return json(data, {
    status: init.status ?? 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      ...(init.cache ? { 'cache-control': 'private, max-age=30' } : {}),
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // App Proxy signs the request + injects logged_in_customer_id for a logged-in buyer.
  const loggedInCustomerId = url.searchParams.get('logged_in_customer_id') ?? '';

  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: '/proxy/ca/customer-data' },
    async () => {
      // Verify the HMAC-signed app-proxy request (rejects a forged/unsigned call).
      const { session } = await shopify.authenticate.public.appProxy(request);
      const shopDomain = session?.shop ?? url.searchParams.get('shop') ?? '';
      if (!shopDomain) return caJson({});

      // A guest (no logged-in customer) → honest empty; nothing app-owned to resolve.
      if (!loggedInCustomerId) return caJson({});

      const shop = await getPrisma().shop.findUnique({
        where: { shopDomain },
        select: { id: true },
      });
      if (!shop) return caJson({});

      const customerGid = `gid://shopify/Customer/${loggedInCustomerId}`;

      const [loyalty, subscription] = await Promise.all([
        readLoyaltyBalance(shop.id, customerGid),
        readCustomerSubscription(shop.id, customerGid),
      ]);

      const out: CaCustomerData = {};
      // Only include a real number — an unconfigured/absent ledger stays omitted.
      if (loyalty.points != null) out.loyaltyPoints = loyalty.points;

      const sub: { nextOrderDate?: string; status?: string } = {};
      if (subscription.nextOrderDate) sub.nextOrderDate = subscription.nextOrderDate;
      if (subscription.status) sub.status = subscription.status;
      if (sub.nextOrderDate || sub.status) out.subscription = sub;

      return caJson(out, { cache: true });
    },
  );
}

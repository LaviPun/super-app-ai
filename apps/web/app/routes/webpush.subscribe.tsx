/**
 * Web-push subscribe route (build #17b) — stores a browser push subscription.
 *
 * `webPushClientRegistration()` POSTs the captured `PushSubscription` (JSON) to this
 * URL (`/webpush/subscribe` by default). We persist it into the shop's
 * `push_subscriptions` DataStore (see push-subscription-store.server.ts), keyed by
 * endpoint so a re-subscribe UPSERTS. The messaging runner's push audience reads this
 * SAME store, so a captured subscription becomes a real, sendable recipient.
 *
 * A DELETE (or POST `{ endpoint, unsubscribe:true }`) PRUNES a subscription — the
 * client-side unsubscribe path AND the server-side stale-prune (410/404 from the push
 * service) both land here so a gone subscription is really removed, never left to fake.
 *
 * Shop context: the subscription is a storefront/customer artifact, so the shop is
 * taken from the `shop` param the registration snippet includes and validated against
 * a known Shop row. An unknown/absent shop is rejected — we never store orphaned data.
 */
import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import {
  PushSubscriptionStore,
  parsePushSubscription,
} from '~/services/messaging/push-subscription-store.server';

async function resolveShopId(request: Request, bodyShop?: string): Promise<string | null> {
  const url = new URL(request.url);
  const shopDomain = (bodyShop ?? url.searchParams.get('shop') ?? '').trim().toLowerCase();
  if (!shopDomain) return null;
  const shop = await getPrisma().shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  return shop?.id ?? null;
}

export async function action({ request }: ActionFunctionArgs) {
  return withApiLogging(
    {
      actor: 'APP_PROXY',
      method: request.method,
      path: '/webpush/subscribe',
      // The subscription contains endpoint keys — do not capture the request body.
      captureRequestBody: false,
    },
    async () => {
      const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
      const bodyShop = typeof body.shop === 'string' ? body.shop : undefined;
      const shopId = await resolveShopId(request, bodyShop);
      if (!shopId) return json({ ok: false, reason: 'shop_unknown' }, { status: 400 });

      const store = new PushSubscriptionStore();

      // Prune path: DELETE, or POST with an explicit unsubscribe + endpoint.
      const isDelete =
        request.method.toUpperCase() === 'DELETE' || body.unsubscribe === true;
      if (isDelete) {
        const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
        if (!endpoint) return json({ ok: false, reason: 'endpoint_required' }, { status: 400 });
        const { removed } = await store.prune(shopId, endpoint);
        return json({ ok: true, pruned: removed });
      }

      // Store path: the POSTed body IS the PushSubscription (endpoint + keys.*).
      const sub = parsePushSubscription(body);
      if (!sub) {
        // No opt-in without a well-formed subscription — refuse honestly.
        return json({ ok: false, reason: 'invalid_subscription' }, { status: 400 });
      }
      const customerId = typeof body.customerId === 'string' ? body.customerId : undefined;
      const { created } = await store.upsert(shopId, sub, { customerId });
      return json({ ok: true, created });
    },
  );
}

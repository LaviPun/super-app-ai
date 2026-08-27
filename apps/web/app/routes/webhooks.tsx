import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { type HttpSyncTrigger } from '~/services/integration/http-sync-runner.service';
import {
  checkAndMarkWebhookEvent,
  extractWebhookEventId,
  unmarkWebhookEvent,
} from '~/services/flows/idempotency.server';
import { SHOPIFY_METAOBJECT_CLEANUP_JOB_TYPE } from '~/services/jobs/shopify-metaobject-cleanup.job';
import { enqueueOwnedJob } from '~/services/jobs/ops-queue.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import { OpsAlertService } from '~/services/observability/ops-alert.server';
import type { AdminApiContext } from '~/types/shopify';

/**
 * Shopify webhook topic → the SuperApp trigger enum that flow.automation /
 * messaging.campaign / integration.httpSync modules subscribe to. Extends the
 * original orders/create + products/update pair to the full integration.httpSync
 * trigger surface (build #7a): every topic here must also be declared in
 * shopify.app.toml [[webhooks.subscriptions]] pointing at /webhooks, so Shopify
 * actually delivers it (managed app-specific webhooks; see webhookSubscriptionCreate
 * docs — "app-specific webhook subscriptions specified in your shopify.app.toml … are
 * automatically kept up to date by Shopify").
 */
const TOPIC_TO_TRIGGER: Record<string, HttpSyncTrigger> = {
  'orders/create': 'SHOPIFY_WEBHOOK_ORDER_CREATED',
  'products/update': 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
  'customers/create': 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED',
  // fulfillments/create + draft_orders/create are wired here so delivery works the moment
  // the scope (read_fulfillments / read_draft_orders) + [[webhooks.subscriptions]] are added
  // together. Neither scope is currently in shopify.app.toml, so Shopify does NOT deliver
  // these topics today — these two entries are inert, not working (see GRANTED_WEBHOOK_SCOPES
  // in @superapp/core and the honest note in shopify.app.toml). Do not present them as live.
  'fulfillments/create': 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED',
  'draft_orders/create': 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED',
  'collections/create': 'SHOPIFY_WEBHOOK_COLLECTION_CREATED',
};

export async function action({ request }: { request: Request }) {
  const { admin, payload, shop, topic } = await shopify.authenticate.webhook(request);
  const normalizedTopic = String(topic ?? '').toLowerCase();
  const prisma = getPrisma();

  const trigger = TOPIC_TO_TRIGGER[normalizedTopic];
  if (trigger) {
    // Claim the event BEFORE processing so concurrent redeliveries can't double-run,
    // but release the claim if processing fails so Shopify's redelivery is re-processed
    // instead of being dropped as a duplicate.
    const eventId = extractWebhookEventId(request);
    const isNew = await checkAndMarkWebhookEvent({ shopDomain: shop, topic, eventId });
    if (!isNew) return new Response(undefined, { status: 200 });

    const runner = new FlowRunnerService();
    try {
      await runner.runForTrigger(shop, admin as unknown as AdminApiContext['admin'], trigger, payload);
    } catch (err) {
      logger.error(`[webhooks] ${normalizedTopic} flow run failed — releasing event for redelivery`, {
        shopDomain: shop,
        eventId,
        ...safeErrorMeta(err),
      });
      await unmarkWebhookEvent({ shopDomain: shop, topic, eventId }).catch((releaseErr) => {
        logger.error('[webhooks] failed to release webhook event claim', {
          shopDomain: shop,
          eventId,
          ...safeErrorMeta(releaseErr),
        });
      });
      // Non-2xx → Shopify redelivers; the released claim lets the retry process it.
      return new Response(undefined, { status: 500 });
    }

    // WS-G Task 16: the four best-effort siblings below CLAIM + ENQUEUE + ACK
    // instead of running inline — the actual work happens on
    // scripts/worker.ts's "superapp-ops" queue (Task 14) so a
    // slow/rate-limited downstream service can't hold the webhook request
    // open. shopId is resolved once and shared across all four (a DB hiccup
    // here must not 500 the webhook either — resolved best-effort, falling
    // back to undefined so downstream executors surface their own clear
    // error).
    let shopId: string | undefined;
    try {
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: shop }, select: { id: true } });
      shopId = shopRow?.id;
    } catch (err) {
      logger.error('[webhooks] shop lookup for fan-out failed', { shopDomain: shop, eventId, ...safeErrorMeta(err) });
    }

    // Fix round (Important #5): each sibling's ENQUEUE call (a fast, local
    // queue write — never the executor's own downstream work, which stays
    // genuinely best-effort/async on the Job row it created) is still
    // attempted independently so one failing doesn't block the others, but
    // if ANY of them throws the claim is released and the webhook 500s so
    // Shopify redelivers — an enqueue failure means something structurally
    // wrong (Redis/DB unreachable), not a downstream side effect that's
    // expected to sometimes fail, so it deserves the same claim/release
    // discipline the primary flow run already gets. A redelivery re-runs the
    // whole handler, including any sibling enqueue that already succeeded —
    // safe for MESSAGING_RUN/RESTOCK_WATCH_RUN/LOYALTY_ACCRUAL_RUN (all
    // idempotent per job-retry-policy.ts) and matches the SAME accepted
    // "release ⇒ full re-run may repeat already-done work" pattern the
    // primary flow run's own claim/release already carries (a redelivered
    // flow could re-run an Admin API mutation a step already made) — not a
    // new risk category this fix introduces, just applied consistently to
    // HTTP_SYNC_RUN too now.
    //
    // Accepted residual (pre-existing, unchanged by this fix): a hard
    // process CRASH between two sibling enqueues (as opposed to a thrown
    // error) leaves the event claimed but never releases it or responds —
    // Shopify's own timeout-triggered redelivery would then see the claim
    // still held (isNew: false) and drop the redelivery as a duplicate,
    // silently losing whichever siblings hadn't enqueued yet. This exposure
    // already existed before this fix (a crash between the primary flow run
    // and the old per-sibling try/catches had the same shape) and stays out
    // of scope here — closing it needs a broader atomic-claim/outbox
    // redesign.
    let anySiblingEnqueueFailed = false;
    const enqueueSibling = async (
      fanout: 'messaging' | 'httpSync' | 'restock' | 'loyalty',
      input: Parameters<typeof enqueueOwnedJob>[0],
    ) => {
      try {
        await enqueueOwnedJob(input);
      } catch (err) {
        anySiblingEnqueueFailed = true;
        logger.error(`[webhooks] ${normalizedTopic} ${fanout} fan-out enqueue failed`, {
          shopDomain: shop,
          eventId,
          ...safeErrorMeta(err),
        });
        await new OpsAlertService()
          .fire({
            kind: 'WEBHOOK_FANOUT_FAILED',
            message: `${normalizedTopic} ${fanout} enqueue failed`,
            error: err,
            context: { shopDomain: shop, topic: normalizedTopic, fanout },
          })
          .catch(() => {});
      }
    };

    // Sibling to the flow runner (R3.4): fan out any PUBLISHED messaging.campaign
    // reacting to this trigger.
    await enqueueSibling('messaging', {
      type: 'MESSAGING_RUN',
      shopId,
      payload: { trigger, event: payload },
      correlationId: eventId,
    });

    // Sibling to the flow runner (build #7a): fan out any PUBLISHED integration.httpSync
    // module reacting to this trigger — map the declared fields and dispatch (signed) to
    // the merchant's connected service.
    await enqueueSibling('httpSync', {
      type: 'HTTP_SYNC_RUN',
      shopId,
      payload: { trigger, event: payload },
      correlationId: eventId,
    });

    // Back-in-stock / price-drop watcher (Track V-C, C1): on a products/update, notify
    // any WAITING back_in_stock / price_drop DataCapture subscription whose variant just
    // crossed into stock or fell below its subscription-time price, then mark it notified.
    // products/update is the deliverable signal (read_products granted); inventory_levels/
    // update needs an ungranted read_inventory scope and would be inert.
    if (normalizedTopic === 'products/update') {
      await enqueueSibling('restock', {
        type: 'RESTOCK_WATCH_RUN',
        shopId,
        payload: { event: payload },
        correlationId: eventId,
      });
    }

    // Loyalty accrual (R3.6): on an order, credit points into every loyalty-ledger
    // composite the shop published. Accrual is itself idempotent (keyed by the order
    // GID in the ledger row), so it is safe even under a same-shop double-invoke on
    // top of the WebhookEvent dedup.
    if (normalizedTopic === 'orders/create') {
      await enqueueSibling('loyalty', {
        type: 'LOYALTY_ACCRUAL_RUN',
        shopId,
        payload,
        correlationId: eventId,
      });
    }

    if (anySiblingEnqueueFailed) {
      await unmarkWebhookEvent({ shopDomain: shop, topic, eventId }).catch((releaseErr) => {
        logger.error('[webhooks] failed to release webhook event claim after a sibling enqueue failure', {
          shopDomain: shop,
          eventId,
          ...safeErrorMeta(releaseErr),
        });
      });
      return new Response(undefined, { status: 500 });
    }

    return new Response(undefined, { status: 200 });
  }

  if (normalizedTopic === 'app/uninstalled') {
    const shopRow = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    await prisma.session.deleteMany({ where: { shop } });

    if (shopRow) {
      await prisma.appSubscription.updateMany({
        where: { shopId: shopRow.id },
        data: { status: 'CANCELLED' },
      });
      // Consumed by drainShopifyMetaobjectCleanupJobs (services/jobs/shopify-metaobject-cleanup.job.ts).
      await prisma.job.create({
        data: {
          shopId: shopRow.id,
          type: SHOPIFY_METAOBJECT_CLEANUP_JOB_TYPE,
          status: 'QUEUED',
          payload: JSON.stringify({ reason: 'APP_UNINSTALLED', shopDomain: shop }),
        },
      });
      await prisma.activityLog.create({
        data: {
          actor: 'WEBHOOK',
          action: 'APP_UNINSTALLED',
          resource: `shop:${shopRow.id}`,
          shopId: shopRow.id,
          details: JSON.stringify({ shopDomain: shop }),
        },
      });
    }
    return new Response(undefined, { status: 200 });
  }

  if (normalizedTopic === 'app/scopes_update') {
    const appScopes =
      Array.isArray((payload as { app_scopes?: unknown })?.app_scopes)
        ? (payload as { app_scopes: string[] }).app_scopes
        : [];
    const shopRow = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    await prisma.activityLog.create({
      data: {
        actor: 'WEBHOOK',
        action: 'APP_SCOPES_UPDATE',
        resource: shopRow ? `shop:${shopRow.id}` : `shop_domain:${shop}`,
        shopId: shopRow?.id,
        details: JSON.stringify({ shopDomain: shop, appScopes }),
      },
    });
    return new Response(undefined, { status: 200 });
  }

  return new Response(undefined, { status: 200 });
}

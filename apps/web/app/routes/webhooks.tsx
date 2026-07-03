import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { MessagingRunnerService } from '~/services/messaging/messaging-runner.service';
import { HttpSyncRunnerService, type HttpSyncTrigger } from '~/services/integration/http-sync-runner.service';
import { accrueForOrder, type OrderPayload } from '~/services/composites/loyalty-accrual.server';
import {
  checkAndMarkWebhookEvent,
  extractWebhookEventId,
  unmarkWebhookEvent,
} from '~/services/flows/idempotency.server';
import { SHOPIFY_METAOBJECT_CLEANUP_JOB_TYPE } from '~/services/jobs/shopify-metaobject-cleanup.job';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
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

    // Sibling to the flow runner (R3.4): fan out any PUBLISHED messaging.campaign
    // reacting to this trigger. Best-effort — a messaging failure must NOT release
    // the event or 500 the webhook (the flow run already succeeded and consumed the
    // claim); it's logged for retry via the campaign's own failed job.
    try {
      await new MessagingRunnerService().runForTrigger(
        shop,
        admin as unknown as AdminApiContext['admin'],
        trigger,
        payload,
      );
    } catch (err) {
      logger.error(`[webhooks] ${normalizedTopic} messaging fan-out failed`, {
        shopDomain: shop,
        eventId,
        ...safeErrorMeta(err),
      });
    }

    // Sibling to the flow runner (build #7a): fan out any PUBLISHED integration.httpSync
    // module reacting to this trigger — map the declared fields and dispatch (signed) to
    // the merchant's connected service. Best-effort — a sync failure must NOT release the
    // event or 500 the webhook (the flow run already consumed the claim); the runner
    // dead-letters its own failures for the cron replay sweep, so nothing is lost.
    try {
      await new HttpSyncRunnerService().runForTrigger(
        shop,
        admin as unknown as AdminApiContext['admin'],
        trigger,
        payload,
      );
    } catch (err) {
      logger.error(`[webhooks] ${normalizedTopic} httpSync fan-out failed`, {
        shopDomain: shop,
        eventId,
        ...safeErrorMeta(err),
      });
    }

    // Loyalty accrual (R3.6): on an order, credit points into every loyalty-ledger
    // composite the shop published. Best-effort — a failure must NOT release the
    // event or 500 the webhook (the flow run already consumed the claim). Accrual
    // is itself idempotent (keyed by the order GID in the ledger row), so it is
    // safe even under a same-shop double-invoke on top of the WebhookEvent dedup.
    if (normalizedTopic === 'orders/create') {
      try {
        const shopRow = await prisma.shop.findUnique({ where: { shopDomain: shop }, select: { id: true } });
        if (shopRow) {
          await accrueForOrder(shopRow.id, payload as OrderPayload);
        }
      } catch (err) {
        logger.error('[webhooks] orders/create loyalty accrual failed', {
          shopDomain: shop,
          eventId,
          ...safeErrorMeta(err),
        });
      }
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

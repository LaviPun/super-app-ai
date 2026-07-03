import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import {
  checkAndMarkWebhookEvent,
  extractWebhookEventId,
  unmarkWebhookEvent,
} from '~/services/flows/idempotency.server';
import { SHOPIFY_METAOBJECT_CLEANUP_JOB_TYPE } from '~/services/jobs/shopify-metaobject-cleanup.job';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import type { AdminApiContext } from '~/types/shopify';

export async function action({ request }: { request: Request }) {
  const { admin, payload, shop, topic } = await shopify.authenticate.webhook(request);
  const normalizedTopic = String(topic ?? '').toLowerCase();
  const prisma = getPrisma();

  if (normalizedTopic === 'orders/create' || normalizedTopic === 'products/update') {
    // Claim the event BEFORE processing so concurrent redeliveries can't double-run,
    // but release the claim if processing fails so Shopify's redelivery is re-processed
    // instead of being dropped as a duplicate.
    const eventId = extractWebhookEventId(request);
    const isNew = await checkAndMarkWebhookEvent({ shopDomain: shop, topic, eventId });
    if (!isNew) return new Response(undefined, { status: 200 });

    const trigger =
      normalizedTopic === 'orders/create'
        ? 'SHOPIFY_WEBHOOK_ORDER_CREATED'
        : 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED';
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

import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { checkAndMarkWebhookEvent, extractWebhookEventId } from '~/services/flows/idempotency.server';
import type { AdminApiContext } from '~/types/shopify';

export async function action({ request }: { request: Request }) {
  const { admin, payload, shop, topic } = await shopify.authenticate.webhook(request);
  const normalizedTopic = String(topic ?? '').toLowerCase();
  const prisma = getPrisma();

  if (normalizedTopic === 'orders/create' || normalizedTopic === 'products/update') {
    const eventId = extractWebhookEventId(request);
    const isNew = await checkAndMarkWebhookEvent({ shopDomain: shop, topic, eventId });
    if (!isNew) return new Response(undefined, { status: 200 });

    const trigger =
      normalizedTopic === 'orders/create'
        ? 'SHOPIFY_WEBHOOK_ORDER_CREATED'
        : 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED';
    const runner = new FlowRunnerService();
    await runner.runForTrigger(shop, admin as unknown as AdminApiContext['admin'], trigger, payload);
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
      await prisma.job.create({
        data: {
          shopId: shopRow.id,
          type: 'SHOPIFY_METAOBJECT_CLEANUP',
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

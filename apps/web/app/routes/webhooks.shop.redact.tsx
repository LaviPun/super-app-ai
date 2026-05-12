/**
 * GDPR: shop/redact (doc Section 2.4).
 * Shopify sends this when a shop uninstalls the app. Delete or anonymize all data for that shop.
 */

import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { payload } = await shopify.authenticate.webhook(request);

  const webhookPayload = payload as { shop_id?: number; shop_domain?: string };
  const shopDomain = webhookPayload.shop_domain ?? webhookPayload.shop_id?.toString();
  if (!shopDomain)
    return new Response(JSON.stringify({ error: 'Missing shop identifier' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return new Response(undefined, { status: 200 });

  const counts = {
    dataCaptures: 0,
    moduleEvents: 0,
    moduleMetricsDaily: 0,
    attributionLinks: 0,
  };

  counts.dataCaptures = (await prisma.dataCapture.deleteMany({ where: { shopId: shop.id } })).count;
  counts.moduleEvents = (await prisma.moduleEvent.deleteMany({ where: { shopId: shop.id } })).count;
  counts.moduleMetricsDaily = (await prisma.moduleMetricsDaily.deleteMany({ where: { shopId: shop.id } })).count;
  counts.attributionLinks = (await prisma.attributionLink.deleteMany({ where: { shopId: shop.id } })).count;

  await prisma.activityLog.create({
    data: {
      actor: 'WEBHOOK',
      action: 'GDPR_SHOP_REDACT',
      resource: `shop:${shop.id}`,
      shopId: shop.id,
      details: JSON.stringify({ shopDomain, counts }),
    },
  });

  return new Response(undefined, { status: 200 });
}

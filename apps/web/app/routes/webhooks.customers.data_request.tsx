/**
 * GDPR: customers/data_request (doc Section 2.4).
 * Shopify sends this when a customer requests their data. Respond with 200 and provide data or confirm handling.
 */

import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { payload, shop: authenticatedShopDomain } = await shopify.authenticate.webhook(request);

  const body = payload as {
    shop_id?: number;
    shop_domain?: string;
    customer?: { id: number; email?: string };
    orders_requested?: number[];
  };
  const shopDomain = body.shop_domain ?? authenticatedShopDomain ?? body.shop_id?.toString();
  if (!shopDomain)
    return new Response(JSON.stringify({ error: 'Missing shop identifier' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return new Response(undefined, { status: 200 });

  const customerId = body.customer?.id;
  const dataRequested: Record<string, unknown> = { shopId: shop.id, customerId: customerId ?? null };

  const captures = await prisma.dataCapture.findMany({
    where: { shopId: shop.id, ...(customerId != null ? {} : {}) },
    select: { id: true, captureType: true, createdAt: true },
    take: 1000,
  });
  dataRequested.dataCapturesCount = captures.length;

  await prisma.activityLog.create({
    data: {
      actor: 'WEBHOOK',
      action: 'GDPR_DATA_REQUEST',
      resource: `customer:${customerId ?? 'shop'}`,
      shopId: shop.id,
      details: JSON.stringify({ customerId, dataRequested }),
    },
  });

  return new Response(undefined, { status: 200 });
}

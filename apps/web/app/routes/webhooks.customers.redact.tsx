/**
 * GDPR: customers/redact (doc Section 2.4).
 * Shopify sends this when a customer requests deletion. Delete or anonymize that customer's data.
 */

import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { payload, shop: authenticatedShopDomain } = await shopify.authenticate.webhook(request);

  const body = payload as {
    shop_id?: number;
    shop_domain?: string;
    customer?: { id: number };
    orders_to_redact?: number[];
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

  if (customerId != null) {
    const deleted = await prisma.dataCapture.deleteMany({
      where: {
        shopId: shop.id,
        payload: { contains: `"customer_id":${customerId}` },
      },
    });
    await prisma.activityLog.create({
      data: {
        actor: 'WEBHOOK',
        action: 'GDPR_CUSTOMER_REDACT',
        resource: `customer:${customerId}`,
        shopId: shop.id,
        details: JSON.stringify({ customerId, dataCapturesDeleted: deleted.count }),
      },
    });
  }

  return new Response(undefined, { status: 200 });
}

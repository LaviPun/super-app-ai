import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

type AppUninstalledPayload = {
  id?: number;
  domain?: string;
  name?: string;
  myshopify_domain?: string;
};

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { payload, shop: authenticatedShopDomain } = await shopify.authenticate.webhook(request);

  const uninstallPayload = payload as AppUninstalledPayload;
  const shopDomain = String(uninstallPayload.myshopify_domain ?? uninstallPayload.domain ?? authenticatedShopDomain ?? '')
    .trim()
    .toLowerCase();
  if (!shopDomain) {
    return new Response(JSON.stringify({ error: 'Missing shop domain' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });

  await prisma.session.deleteMany({ where: { shop: shopDomain } });

  if (shop) {
    await prisma.appSubscription.updateMany({
      where: { shopId: shop.id },
      data: { status: 'CANCELLED' },
    });

    // Queue post-uninstall clean-up so expensive Shopify-side deletions can run asynchronously.
    await prisma.job.create({
      data: {
        shopId: shop.id,
        type: 'SHOPIFY_METAOBJECT_CLEANUP',
        status: 'QUEUED',
        payload: JSON.stringify({ reason: 'APP_UNINSTALLED', shopDomain }),
      },
    });

    await prisma.activityLog.create({
      data: {
        actor: 'WEBHOOK',
        action: 'APP_UNINSTALLED',
        resource: `shop:${shop.id}`,
        shopId: shop.id,
        details: JSON.stringify({ shopDomain }),
      },
    });
  }

  return new Response(undefined, { status: 200 });
}

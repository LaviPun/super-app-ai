import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

type AppScopesUpdatePayload = {
  id?: number;
  domain?: string;
  myshopify_domain?: string;
  app_scopes?: string[];
};

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { payload, shop: authenticatedShopDomain } = await shopify.authenticate.webhook(request);

  const body = payload as AppScopesUpdatePayload;
  const shopDomain = String(body.myshopify_domain ?? authenticatedShopDomain ?? body.domain ?? '').trim().toLowerCase();
  if (!shopDomain) {
    return new Response(JSON.stringify({ error: 'Missing shop domain' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const scopes = Array.isArray(body.app_scopes) ? body.app_scopes : [];
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });

  await prisma.activityLog.create({
    data: {
      actor: 'WEBHOOK',
      action: 'APP_SCOPES_UPDATE',
      resource: shop ? `shop:${shop.id}` : `shop_domain:${shopDomain}`,
      shopId: shop?.id,
      details: JSON.stringify({ shopDomain, appScopes: scopes }),
    },
  });

  return new Response(undefined, { status: 200 });
}

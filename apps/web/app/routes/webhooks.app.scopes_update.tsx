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

  const { payload } = await shopify.authenticate.webhook(request);
  const webhookPayload = payload as AppScopesUpdatePayload;
  const shopDomain = String(webhookPayload.myshopify_domain ?? webhookPayload.domain ?? '').trim().toLowerCase();
  if (!shopDomain) {
    return new Response(JSON.stringify({ error: 'Missing shop domain' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const scopes = Array.isArray(webhookPayload.app_scopes) ? webhookPayload.app_scopes : [];
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

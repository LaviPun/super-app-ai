import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { MappingService } from '~/services/connectors/mapping.service';
import { getPrisma } from '~/db.server';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  enforceRateLimit(`connectors:suggest-mapping:${session.shop}`);

  const body = await request.json().catch(() => null) as null | { connectorId: string };
  if (!body?.connectorId) return json({ error: 'Missing connectorId' }, { status: 400 });

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

  const svc = new MappingService();
  const suggestion = await svc.suggestFromConnector(shopRow.id, body.connectorId);
  return json({ ok: true, suggestion });
}

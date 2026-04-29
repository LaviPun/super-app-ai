import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ConnectorService, parseConnectorAuth } from '~/services/connectors/connector.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API: List + create connectors.
 *
 * GET  /api/agent/connectors          → list all connectors
 * POST /api/agent/connectors          → create a new connector
 *   Body: { name, baseUrl, allowlistDomains?, auth: { type, ... } }
 */
export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: true, connectors: [] });

  const connectors = await prisma.connector.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { endpoints: true } } },
  });

  return json({
    ok: true,
    connectors: connectors.map(c => ({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      authType: c.authType,
      lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
      endpointCount: c._count.endpoints,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  const body = await request.json().catch(() => null) as {
    name?: string; baseUrl?: string; allowlistDomains?: string[]; auth?: unknown;
  } | null;

  if (!body?.name || !body?.baseUrl || !body?.auth) {
    return json({ error: 'Missing required fields: name, baseUrl, auth' }, { status: 400 });
  }
  const auth = parseConnectorAuth(body.auth);
  if (!auth) {
    return json({ error: 'Invalid auth: expected API_KEY, BASIC, or OAUTH2 shape.' }, { status: 400 });
  }

  const svc = new ConnectorService();
  let connector;
  try {
    connector = await svc.create({
      shopDomain: session.shop,
      name: body.name,
      baseUrl: body.baseUrl,
      allowlistDomains: body.allowlistDomains ?? [],
      auth,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Create failed' }, { status: 400 });
  }

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  await new ActivityLogService().log({
    actor: 'SYSTEM',
    action: 'CONNECTOR_CREATED',
    resource: `connector:${connector.id}`,
    shopId: shopRow?.id,
    details: { name: connector.name, baseUrl: connector.baseUrl, source: 'agent_api' },
  }).catch(() => {/* non-fatal */});

  return json({ ok: true, connectorId: connector.id, name: connector.name, baseUrl: connector.baseUrl }, { status: 201 });
}

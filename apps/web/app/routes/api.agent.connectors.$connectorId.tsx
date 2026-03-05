import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { ConnectorService } from '~/services/connectors/connector.service';

/**
 * Agent API: Get, update, or delete a connector.
 *
 * GET  /api/agent/connectors/:connectorId             → get connector details
 * POST /api/agent/connectors/:connectorId             → intent-based:
 *   { intent: 'update', name?, baseUrl?, allowlistDomains? }
 *   { intent: 'delete' }
 */
export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { connectorId?: string };
}) {
  const { session } = await shopify.authenticate.admin(request);
  const connectorId = params.connectorId;
  if (!connectorId) return json({ error: 'Missing connectorId' }, { status: 400 });

  const prisma = getPrisma();
  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, shop: { shopDomain: session.shop } },
    include: { endpoints: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!connector) return json({ error: 'Connector not found' }, { status: 404 });

  return json({
    ok: true,
    connector: {
      id: connector.id,
      name: connector.name,
      baseUrl: connector.baseUrl,
      authType: connector.authType,
      allowlistDomains: connector.allowlistDomains,
      lastTestedAt: connector.lastTestedAt?.toISOString() ?? null,
      createdAt: connector.createdAt.toISOString(),
      endpoints: connector.endpoints.map(e => ({
        id: e.id,
        name: e.name,
        path: e.path,
        method: e.method,
        lastTestedAt: e.lastTestedAt?.toISOString() ?? null,
        lastStatus: e.lastStatus,
      })),
    },
  });
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { connectorId?: string };
}) {
  const { session } = await shopify.authenticate.admin(request);
  const connectorId = params.connectorId;
  if (!connectorId) return json({ error: 'Missing connectorId' }, { status: 400 });

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Invalid body' }, { status: 400 });

  const intent = String(body.intent ?? 'delete');
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const activity = new ActivityLogService();

  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, shop: { shopDomain: session.shop } },
  });
  if (!connector) return json({ error: 'Connector not found' }, { status: 404 });

  if (intent === 'update') {
    const svc = new ConnectorService();
    try {
      await svc.update({
        shopDomain: session.shop,
        connectorId,
        name: body.name ? String(body.name) : undefined,
        baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
        allowlistDomains: Array.isArray(body.allowlistDomains)
          ? (body.allowlistDomains as string[])
          : undefined,
      });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Update failed' }, { status: 400 });
    }
    await activity.log({
      actor: 'SYSTEM',
      action: 'CONNECTOR_UPDATED',
      resource: `connector:${connectorId}`,
      shopId: shopRow?.id,
      details: { name: body.name, baseUrl: body.baseUrl, source: 'agent_api' },
    }).catch(() => {});
    return json({ ok: true, connectorId, updated: true });
  }

  if (intent === 'delete') {
    await prisma.connector.delete({ where: { id: connectorId } });
    await activity.log({
      actor: 'SYSTEM',
      action: 'CONNECTOR_DELETED',
      resource: `connector:${connectorId}`,
      shopId: shopRow?.id,
      details: { name: connector.name, source: 'agent_api' },
    }).catch(() => {});
    return json({ ok: true, connectorId, deleted: true });
  }

  return json({ error: `Unknown intent: ${intent}. Valid: update, delete` }, { status: 400 });
}

import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API: ConnectorEndpoint CRUD.
 *
 * GET  /api/agent/connectors/:connectorId/endpoints
 *   → list saved endpoints for a connector
 *
 * POST /api/agent/connectors/:connectorId/endpoints
 *   { intent: 'create', name, path, method?, defaultHeaders?, defaultBody? }
 *   { intent: 'update', endpointId, name?, path?, method?, defaultHeaders?, defaultBody? }
 *   { intent: 'delete', endpointId }
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
  });
  if (!connector) return json({ error: 'Connector not found' }, { status: 404 });

  const endpoints = await prisma.connectorEndpoint.findMany({
    where: { connectorId },
    orderBy: { sortOrder: 'asc' },
  });

  return json({
    ok: true,
    connectorId,
    endpoints: endpoints.map(e => ({
      id: e.id,
      name: e.name,
      path: e.path,
      method: e.method,
      defaultHeaders: e.defaultHeaders ? JSON.parse(e.defaultHeaders) : null,
      defaultBody: e.defaultBody ? JSON.parse(e.defaultBody) : null,
      lastTestedAt: e.lastTestedAt?.toISOString() ?? null,
      lastStatus: e.lastStatus,
    })),
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

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, shop: { shopDomain: session.shop } },
  });
  if (!connector) return json({ error: 'Connector not found' }, { status: 404 });

  const intent = String(body.intent ?? 'create');
  const activity = new ActivityLogService();

  if (intent === 'create') {
    const name = String(body.name ?? '').trim();
    const path = String(body.path ?? '').trim();
    const method = String(body.method ?? 'GET').toUpperCase();
    if (!name || !path) return json({ error: 'name and path are required' }, { status: 400 });
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return json({ error: 'Invalid method. Valid: GET, POST, PUT, PATCH, DELETE' }, { status: 400 });
    }

    const ep = await prisma.connectorEndpoint.create({
      data: {
        connectorId,
        name,
        path,
        method,
        defaultHeaders: body.defaultHeaders ? JSON.stringify(body.defaultHeaders) : null,
        defaultBody: body.defaultBody ? JSON.stringify(body.defaultBody) : null,
      },
    });
    await activity.log({
      actor: 'SYSTEM',
      action: 'CONNECTOR_UPDATED',
      resource: `connector:${connectorId}`,
      shopId: shopRow?.id,
      details: { endpointId: ep.id, name, path, source: 'agent_api' },
    }).catch(() => {});
    return json({ ok: true, intent, endpointId: ep.id, name: ep.name, path: ep.path, method: ep.method }, { status: 201 });
  }

  if (intent === 'update') {
    const endpointId = String(body.endpointId ?? '');
    if (!endpointId) return json({ error: 'Missing endpointId' }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.path !== undefined) data.path = String(body.path);
    if (body.method !== undefined) data.method = String(body.method).toUpperCase();
    if (body.defaultHeaders !== undefined) data.defaultHeaders = body.defaultHeaders ? JSON.stringify(body.defaultHeaders) : null;
    if (body.defaultBody !== undefined) data.defaultBody = body.defaultBody ? JSON.stringify(body.defaultBody) : null;

    await prisma.connectorEndpoint.updateMany({ where: { id: endpointId, connectorId }, data });
    return json({ ok: true, intent, endpointId });
  }

  if (intent === 'delete') {
    const endpointId = String(body.endpointId ?? '');
    if (!endpointId) return json({ error: 'Missing endpointId' }, { status: 400 });
    await prisma.connectorEndpoint.deleteMany({ where: { id: endpointId, connectorId } });
    await activity.log({
      actor: 'SYSTEM',
      action: 'CONNECTOR_UPDATED',
      resource: `connector:${connectorId}`,
      shopId: shopRow?.id,
      details: { endpointId, deleted: true, source: 'agent_api' },
    }).catch(() => {});
    return json({ ok: true, intent, endpointId, deleted: true });
  }

  return json({ error: `Unknown intent: ${intent}. Valid: create, update, delete` }, { status: 400 });
}

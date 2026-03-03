import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function loader({ request, params }: { request: Request; params: { connectorId?: string } }) {
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
    endpoints: endpoints.map(e => ({
      id: e.id,
      name: e.name,
      path: e.path,
      method: e.method,
      defaultHeaders: e.defaultHeaders,
      defaultBody: e.defaultBody,
      lastTestedAt: e.lastTestedAt?.toISOString() ?? null,
      lastStatus: e.lastStatus,
    })),
  });
}

export async function action({ request, params }: { request: Request; params: { connectorId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const connectorId = params.connectorId;
  if (!connectorId) return json({ error: 'Missing connectorId' }, { status: 400 });

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: `/api/connectors/${connectorId}/endpoints` },
    async () => {
      const prisma = getPrisma();
      const connector = await prisma.connector.findFirst({
        where: { id: connectorId, shop: { shopDomain: session.shop } },
      });
      if (!connector) return json({ error: 'Connector not found' }, { status: 404 });

      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });

      const intent = String(body.intent ?? 'create');

      if (intent === 'create') {
        const name = String(body.name ?? '').trim();
        const path = String(body.path ?? '').trim();
        const method = String(body.method ?? 'GET').toUpperCase();
        if (!name || !path) return json({ error: 'Name and path are required' }, { status: 400 });
        if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          return json({ error: 'Invalid method' }, { status: 400 });
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
        return json({ ok: true, endpoint: { id: ep.id, name: ep.name, path: ep.path, method: ep.method } });
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

        await prisma.connectorEndpoint.updateMany({
          where: { id: endpointId, connectorId },
          data,
        });
        return json({ ok: true });
      }

      if (intent === 'delete') {
        const endpointId = String(body.endpointId ?? '');
        if (!endpointId) return json({ error: 'Missing endpointId' }, { status: 400 });
        await prisma.connectorEndpoint.deleteMany({ where: { id: endpointId, connectorId } });
        return json({ ok: true });
      }

      return json({ error: 'Unknown intent' }, { status: 400 });
    },
  );
}

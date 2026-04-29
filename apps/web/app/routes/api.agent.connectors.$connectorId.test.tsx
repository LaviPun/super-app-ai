import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ConnectorService } from '~/services/connectors/connector.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API: Test a connector endpoint.
 *
 * POST /api/agent/connectors/:connectorId/test
 * Body: { path: string, method?: 'GET'|'POST'|..., headers?: {}, body?: unknown }
 *
 * Returns: { ok, status, headers, bodyPreview }
 */
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

  const body = await request.json().catch(() => null) as {
    path?: string; method?: string; headers?: Record<string, string>; body?: unknown;
  } | null;

  if (!body?.path) return json({ error: 'Missing path' }, { status: 400 });

  const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
  type Method = (typeof ALLOWED_METHODS)[number];
  const requestedMethod = body.method ?? 'GET';
  if (!(ALLOWED_METHODS as readonly string[]).includes(requestedMethod)) {
    return json({ error: `Unsupported method: ${requestedMethod}` }, { status: 400 });
  }
  const method = requestedMethod as Method;

  const svc = new ConnectorService();
  let result;
  try {
    result = await svc.test(session.shop, {
      connectorId,
      path: body.path,
      method,
      headers: body.headers,
      body: body.body,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Test failed' }, { status: 400 });
  }

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  await new ActivityLogService().log({
    actor: 'SYSTEM',
    action: 'CONNECTOR_TESTED',
    resource: `connector:${connectorId}`,
    shopId: shopRow?.id,
    details: { path: body.path, method: body.method ?? 'GET', status: result.status, source: 'agent_api' },
  }).catch(() => {/* non-fatal */});

  return json({ ok: true, result });
}

import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ConnectorService } from '~/services/connectors/connector.service';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * POST: Update connector name, baseUrl, auth.
 * Body (JSON): { name?, baseUrl?, allowlistDomains?, auth? }
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

  enforceRateLimit(`connectors:update:${session.shop}`);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: `/api/connectors/${connectorId}/update`, request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });

      const svc = new ConnectorService();
      await svc.update({
        shopDomain: session.shop,
        connectorId,
        name: typeof body.name === 'string' ? body.name : undefined,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
        allowlistDomains: Array.isArray(body.allowlistDomains) ? body.allowlistDomains.map(String) : undefined,
        auth: body.auth as any,
      });

      return json({ ok: true });
    }
  );
}

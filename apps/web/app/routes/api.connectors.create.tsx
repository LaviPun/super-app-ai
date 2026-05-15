import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ConnectorService, parseConnectorAuth } from '~/services/connectors/connector.service';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  await enforceRateLimit(`connectors:create:${session.shop}`);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/connectors/create', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body.name !== 'string' || typeof body.baseUrl !== 'string') {
        return json({ error: 'Missing fields: name, baseUrl, auth' }, { status: 400 });
      }
      const auth = parseConnectorAuth(body.auth);
      if (!auth) {
        return json({ error: 'Invalid auth: expected API_KEY, BASIC, or OAUTH2 shape.' }, { status: 400 });
      }

      const svc = new ConnectorService();
      const connector = await svc.create({
        shopDomain: session.shop,
        name: body.name,
        baseUrl: body.baseUrl,
        allowlistDomains: Array.isArray(body.allowlistDomains) ? body.allowlistDomains.map(String) : [],
        auth,
      });

      return json({ ok: true, connectorId: connector.id });
    }
  );
}

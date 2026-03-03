import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ConnectorService } from '~/services/connectors/connector.service';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  enforceRateLimit(`connectors:create:${session.shop}`);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/connectors/create', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      const body = await request.json().catch(() => null) as any;
      if (!body?.name || !body?.baseUrl || !body?.auth) {
        return json({ error: 'Missing fields: name, baseUrl, auth' }, { status: 400 });
      }

      const svc = new ConnectorService();
      const connector = await svc.create({
        shopDomain: session.shop,
        name: String(body.name),
        baseUrl: String(body.baseUrl),
        allowlistDomains: Array.isArray(body.allowlistDomains) ? body.allowlistDomains.map(String) : [],
        auth: body.auth,
      });

      return json({ ok: true, connectorId: connector.id });
    }
  );
}

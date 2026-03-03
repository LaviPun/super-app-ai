import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ConnectorService } from '~/services/connectors/connector.service';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  enforceRateLimit(`connectors:test:${session.shop}`);

  return withApiLogging(
    { actor: 'MERCHANT', method: 'POST', path: '/api/connectors/test' },
    async () => {
      const body = await request.json().catch(() => null) as any;
      if (!body?.connectorId || !body?.path) {
        return json({ error: 'Missing fields: connectorId, path' }, { status: 400 });
      }

      const svc = new ConnectorService();
      // enforceSsrf inside svc.test() throws on blocked attempts — withApiLogging
      // catches the error, records it as success=false, then re-throws so the caller
      // gets a proper 500. This satisfies "SSRF attempts blocked and logged".
      const result = await svc.test(session.shop, {
        connectorId: String(body.connectorId),
        path: String(body.path),
        method: body.method,
        headers: body.headers,
        body: body.body,
      });

      return json({ ok: true, result });
    }
  );
}

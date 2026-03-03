import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ConnectorService } from '~/services/connectors/connector.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  enforceRateLimit(`connectors:test:${session.shop}`);

  const body = await request.json().catch(() => null) as any;
  if (!body?.connectorId || !body?.path) {
    return json({ error: 'Missing fields: connectorId, path' }, { status: 400 });
  }

  const svc = new ConnectorService();
  const result = await svc.test(session.shop, {
    connectorId: String(body.connectorId),
    path: String(body.path),
    method: body.method,
    headers: body.headers,
    body: body.body,
  });

  return json({ ok: true, result });
}

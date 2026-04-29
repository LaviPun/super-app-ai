import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ConnectorService } from '~/services/connectors/connector.service';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  enforceRateLimit(`connectors:test:${session.shop}`);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/connectors/test', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body.connectorId !== 'string' || typeof body.path !== 'string') {
        return json({ error: 'Missing fields: connectorId, path' }, { status: 400 });
      }

      const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
      type Method = (typeof ALLOWED_METHODS)[number];
      const method: Method | undefined =
        typeof body.method === 'string' && (ALLOWED_METHODS as readonly string[]).includes(body.method)
          ? (body.method as Method)
          : undefined;

      const headers =
        body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers)
          ? (body.headers as Record<string, string>)
          : undefined;

      const svc = new ConnectorService();
      const result = await svc.test(session.shop, {
        connectorId: body.connectorId,
        path: body.path,
        method,
        headers,
        body: body.body,
      });

      return json({ ok: true, result });
    }
  );
}

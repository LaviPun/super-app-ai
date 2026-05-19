import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { enqueueConnectorTestJob } from '~/services/connectors/connector-test-job.server';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  await enforceRateLimit(`connectors:test:${session.shop}`);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/connectors/test', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body.connectorId !== 'string' || typeof body.path !== 'string') {
        return json({ error: 'Missing fields: connectorId, path' }, { status: 400 });
      }

      try {
        const job = await enqueueConnectorTestJob(session.shop, body);
        return json({ ok: true, queued: true, job }, { status: 202 });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid connector test request';
        return json({ error: message }, { status: 400 });
      }
    },
  );
}

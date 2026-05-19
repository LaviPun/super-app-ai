import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enqueueAgentConnectorTestJob } from '~/services/connectors/connector-test-job.server';

/**
 * Agent API: enqueue a connector endpoint test job.
 *
 * POST /api/agent/connectors/:connectorId/test
 * Body: { path: string, method?: 'GET'|'POST'|..., headers?: {}, body?: unknown }
 *
 * Returns: { ok, queued, job: { jobId, status, statusUrl } }
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

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.path !== 'string') {
    return json({ error: 'Missing path' }, { status: 400 });
  }

  try {
    const job = await enqueueAgentConnectorTestJob(session.shop, connectorId, body);
    return json({ ok: true, queued: true, job }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid connector test request';
    return json({ error: message }, { status: 400 });
  }
}

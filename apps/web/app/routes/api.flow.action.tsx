import { json } from '@remix-run/node';
import {
  handleFlowAction,
  resolveFlowActionId,
  verifyFlowActionHmac,
} from '~/services/workflows/shopify-flow-bridge';

/**
 * POST /api/flow/action
 *
 * Runtime endpoint for Shopify Flow action extensions.
 * Shopify Flow calls this URL when a merchant's workflow executes
 * one of our app-provided actions.
 *
 * Flow sends a JSON payload with the action handle and field values.
 * We verify the HMAC signature, resolve the handle to an internal
 * action ID, and delegate to handleFlowAction().
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const rawBody = await request.text();

  const hmacHeader =
    request.headers.get('x-shopify-hmac-sha256') ??
    request.headers.get('http-x-shopify-hmac-sha256') ??
    '';

  const secret = process.env.SHOPIFY_API_SECRET ?? '';

  if (secret && hmacHeader) {
    const valid = await verifyFlowActionHmac(rawBody, hmacHeader, secret);
    if (!valid) {
      return json({ error: 'Invalid HMAC signature' }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const handle = typeof body.handle === 'string' ? body.handle : '';
  const actionId = resolveFlowActionId(handle);
  if (!actionId) {
    return json({ error: `Unknown action handle: ${handle}` }, { status: 400 });
  }

  const shopDomain =
    typeof body.shopDomain === 'string'
      ? body.shopDomain
      : (request.headers.get('x-shopify-shop-domain') ?? '');

  if (!shopDomain) {
    return json({ error: 'Missing shop domain' }, { status: 400 });
  }

  const payload = (typeof body.properties === 'object' && body.properties !== null)
    ? body.properties as Record<string, unknown>
    : body;

  const result = await handleFlowAction(actionId, payload, shopDomain);

  if (!result.success) {
    return json({ error: result.error ?? 'Action failed' }, { status: 422 });
  }

  return json({ ok: true, output: result.output });
}

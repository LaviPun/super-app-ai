/**
 * POS staff-PIN verification app-proxy endpoint (build #16/#22).
 *
 * The generic POS block gates sensitive actions (discounts, loyalty writes) behind a
 * staff PIN: it COLLECTS the PIN with the real PinPad API, then POSTs it to
 * `<appProxyPath>/verify-pin` for SERVER-SIDE verification (the PinPad API has no
 * built-in verification — see posBehavior.js requireStaffPin). `appProxyPath` is
 * normalized to `/api/pos/loyalty`, so this route serves `/api/pos/loyalty/verify-pin`.
 *
 * The PIN is validated against the shop's app-owned staff-PIN store (see
 * staff-pin.server.ts). Fails CLOSED — no config / no match ⇒ `{ verified:false }`;
 * never a fabricated approval. The response is `{ verified:boolean }`, the exact shape
 * `verifyStaffPin` (client) parses.
 */
import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { withApiLogging } from '~/services/observability/api-log.service';
import { authenticatePos } from '~/services/pos/pos-auth.server';
import { verifyStaffPin } from '~/services/pos/staff-pin.server';

export async function action({ request }: ActionFunctionArgs) {
  const { shopId, cors } = await authenticatePos(request);
  return withApiLogging(
    {
      actor: 'APP_PROXY',
      method: request.method,
      path: '/api/pos/loyalty/verify-pin',
      shopId: shopId ?? undefined,
      // The PIN is a secret — never capture the request body.
      captureRequestBody: false,
    },
    async () => {
      if (!shopId) return cors(json({ verified: false }, { status: 200 }));

      const body = (await request.json().catch(() => ({}))) as { pin?: unknown; role?: unknown };
      const pin = typeof body.pin === 'string' ? body.pin : '';
      const role = typeof body.role === 'string' ? body.role : undefined;

      const result = await verifyStaffPin(shopId, pin, role);
      // Only `{ verified }` is contractually required; `reason` aids honest UX.
      return cors(json({ verified: result.verified, reason: result.reason }));
    },
  );
}

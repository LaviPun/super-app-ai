import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import {
  SidekickToolCallSchema,
} from '~/services/sidekick/sidekick-tools.contract';
import { handleSidekickDataTool } from '~/services/sidekick/sidekick-data.server';

/**
 * POST /api/sidekick/tools
 *
 * Backend for the Sidekick DATA extension (`admin.app.tools.data`, M12).
 *
 * The extension bundle runs headlessly in Shopify's sandbox and calls this
 * route with a relative `fetch('/api/sidekick/tools')`, which Shopify resolves
 * against our `app_url` and signs with an OpenID Connect ID token. So we
 * authenticate the same way every embedded route does — `authenticate.admin`
 * accepts the ID/session token — and there is NO custom HMAC surface to invent.
 * Read-only: this route only ever reads the shop's own modules/metrics.
 *
 * Gated behind SIDEKICK_EXTENSION_ENABLED so the code can ship inert before the
 * (developer-preview) extension is approved and registered.
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (process.env.SIDEKICK_EXTENSION_ENABLED !== '1') {
    return json({ error: 'Sidekick extension is not enabled' }, { status: 404 });
  }

  const { session } = await shopify.authenticate.admin(request);

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = SidekickToolCallSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: 'Invalid tool call', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true },
  });
  if (!shopRow) return json({ error: 'Unknown shop' }, { status: 404 });

  try {
    const result = await handleSidekickDataTool(
      shopRow.id,
      parsed.data.tool,
      parsed.data.input,
    );
    return json(result);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import {
  ActivityLogService,
  CLIENT_ALLOWED_ACTIONS,
  type ActivityAction,
} from '~/services/activity/activity.service';

const MAX_DETAILS_SIZE = 4000;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let session: { shop: string };
  try {
    const auth = await shopify.authenticate.admin(request);
    session = auth.session;
  } catch {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string; resource?: string; details?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!action || !CLIENT_ALLOWED_ACTIONS.includes(action as ActivityAction)) {
    return json(
      { error: 'Invalid or disallowed action', allowed: CLIENT_ALLOWED_ACTIONS },
      { status: 400 }
    );
  }

  const resource =
    typeof body.resource === 'string' ? body.resource.slice(0, 500) : undefined;
  let details = body.details;
  if (details != null && typeof details === 'object' && !Array.isArray(details)) {
    const str = JSON.stringify(details);
    if (str.length > MAX_DETAILS_SIZE) {
      details = { _truncated: true, _size: str.length, ...details };
    }
  } else {
    details = undefined;
  }

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  const activity = new ActivityLogService();
  await activity
    .log({
      actor: 'MERCHANT',
      action: action as ActivityAction,
      resource: resource || undefined,
      shopId: shopRow?.id,
      details,
    })
    .catch(() => {});

  return json({ ok: true });
}

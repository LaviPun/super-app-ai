import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ErrorLogService } from '~/services/observability/error-log.service';
import type { ErrorLogSource } from '~/services/observability/error-log.service';
import { ActivityLogService } from '~/services/activity/activity.service';

const REPORT_SOURCE: ErrorLogSource[] = ['ERROR_BOUNDARY', 'CLIENT'];

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let shopId: string | undefined;
  try {
    const { session } = await shopify.authenticate.admin(request);
    const prisma = getPrisma();
    const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
    shopId = shop?.id;
  } catch {
    shopId = undefined;
  }

  let body: { message?: string; stack?: string; route?: string; source?: string; meta?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message : 'Unknown error';
  const stack = typeof body.stack === 'string' ? body.stack : undefined;
  const route = typeof body.route === 'string' ? body.route : undefined;
  const source = body.source && REPORT_SOURCE.includes(body.source as ErrorLogSource)
    ? (body.source as ErrorLogSource)
    : 'CLIENT';
  const meta = body.meta != null ? body.meta : undefined;

  const errLog = new ErrorLogService();
  await errLog.write('ERROR', message, stack, meta, route, shopId, source);

  // Activity log = everything; record this error so it appears in Activity Log too
  const activity = new ActivityLogService();
  await activity
    .log({
      actor: 'MERCHANT',
      action: 'REQUEST_ERROR',
      resource: route ?? request.url,
      shopId,
      details: {
        source,
        message: message.slice(0, 500),
        route,
        ...(meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {}),
      },
    })
    .catch(() => {});

  return json({ ok: true });
}

import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ErrorLogService } from '~/services/observability/error-log.service';
import type { ErrorLogSource } from '~/services/observability/error-log.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { AppError } from '~/services/errors/app-error.server';

const REPORT_SOURCE: ErrorLogSource[] = ['ERROR_BOUNDARY', 'CLIENT'];
const MAX_META_SIZE = 4_096;

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  return 'unknown';
}

function sanitizeMeta(meta: unknown): unknown {
  if (meta == null) return undefined;
  try {
    const serialized = JSON.stringify(meta);
    if (serialized.length <= MAX_META_SIZE) return meta;
    return {
      _truncated: true,
      _originalSize: serialized.length,
      _maxSize: MAX_META_SIZE,
    };
  } catch {
    return { _truncated: true, _invalid: true };
  }
}

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

  const clientIp = getClientIp(request);
  try {
    await enforceRateLimit(`report-error:${clientIp}`);
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      const retryAfterSec = Number(err.details?.retryAfterSec ?? 60);
      return json({ error: err.message }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } });
    }
    throw err;
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
  const meta = sanitizeMeta(body.meta);

  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const shopId = shop?.id;

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

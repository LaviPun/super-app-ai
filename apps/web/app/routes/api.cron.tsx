/**
 * Cron trigger endpoint — the MANUAL / EXTERNAL way to run one cron tick.
 *
 * Since 2026-09 the primary trigger is the worker service's in-process
 * scheduler (`services/jobs/cron-scheduler.server.ts`, every
 * CRON_TICK_INTERVAL_MINUTES). This route stays for: a hand-run tick during an
 * incident (`curl -H "X-Cron-Secret: …" /api/cron`), the GitHub Actions
 * `cron.yml` fallback, and any external scheduler that takes over when
 * CRON_SCHEDULER_ENABLED=false. Both triggers share the same Redis tick lock,
 * so they never overlap: when the worker holds it this returns 200
 * `{ skipped: 'locked' }` (a skip is not a failure — the fallback workflow's
 * dead-man's ping must still fire).
 *
 * Protection: requires `X-Cron-Secret` header matching CRON_SECRET env var.
 * If CRON_SECRET is not set, the endpoint is disabled.
 */
import { json } from '@remix-run/node';
import { getCronTickIntervalMs } from '~/env.server';
import { runCronTick } from '~/services/jobs/cron-tick.server';
import { acquireHttpCronLock } from '~/services/jobs/cron-lock.server';
import { constantTimeSecretMatch } from '~/services/security/secret-compare.server';
import { logger } from '~/services/observability/logger.server';
import { enforceRateLimit, getClientIp } from '~/services/security/rate-limit.server';
import { AppError } from '~/services/errors/app-error.server';

export async function loader({ request }: { request: Request }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }

  const clientIp = getClientIp(request);
  try {
    await enforceRateLimit(`cron:${clientIp}`);
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      const retryAfterSec = Number(err.details?.retryAfterSec ?? 60);
      return json({ error: err.message }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } });
    }
    throw err;
  }

  const provided = request.headers.get('x-cron-secret');
  if (!provided || !constantTimeSecretMatch(provided, secret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireHttpCronLock(getCronTickIntervalMs());
  if (lock.status === 'locked') {
    logger.info('[api.cron] tick skipped — the tick lock is held (worker scheduler or another trigger mid-tick)');
    return json({
      skipped: 'locked',
      message: 'Another cron tick is in progress (worker scheduler holds the lock). Nothing to do.',
    });
  }

  try {
    const result = await runCronTick();
    return json(result);
  } finally {
    if (lock.status === 'acquired') await lock.release();
  }
}

/**
 * Deep health probe (DevOps hardening 2026-09, item c) — /healthz/deep.
 *
 * /healthz stays the cheap, unauthenticated liveness probe Railway and the
 * external uptime monitors hit (db + redis only). This route is the OPS view:
 * everything that can fail without taking the process down — queue backlog,
 * stuck jobs, DLQ depth, error-rate spike, cron heartbeat staleness, AI daily
 * spend — each reported ok/warn/fail/skipped with the measured value.
 *
 * Guarded (it leaks operational detail): callers must present the CRON_SECRET
 * via `X-Cron-Secret` (same header contract as /api/cron — the post-deploy
 * smoke workflow already holds that secret) OR an internal-admin session
 * cookie. 401 otherwise; 503 when CRON_SECRET is unset (mirrors /api/cron).
 *
 * Status code: 503 when the overall status is 'fail' (db down counts as fail),
 * 200 for ok/warn — warn is visible in the body and the admin banner but must
 * not flap external monitors.
 *
 * lastBackupAge is deliberately 'skipped': backups are GitHub Actions
 * artifacts (db-backup.yml) and this process has no GitHub credentials —
 * backup verification lives in .github/workflows/db-restore-verify.yml instead
 * (see docs/runbooks/restore-from-backup.md).
 */
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import Redis from 'ioredis';
import { getPrisma } from '~/db.server';
import { internalSessionStorage } from '~/internal-admin/session.server';
import { constantTimeSecretMatch } from '~/services/security/secret-compare.server';
import { collectOpsHealth, type OpsHealthSignal } from '~/services/observability/ops-health.server';

let redisClient: Redis | null | undefined;

function getDeepHealthRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL?.trim();
  redisClient = url
    ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500, commandTimeout: 1500 })
    : null;
  return redisClient;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== null) clearTimeout(timeoutId);
  });
}

async function isAuthorized(request: Request): Promise<'ok' | 'unauthorized' | 'disabled'> {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('x-cron-secret');
  if (provided) {
    if (!secret) return 'disabled';
    return constantTimeSecretMatch(provided, secret) ? 'ok' : 'unauthorized';
  }
  try {
    const session = await internalSessionStorage.getSession(request.headers.get('cookie'));
    if (session.get('internal_admin') === true) return 'ok';
  } catch {
    // fall through to unauthorized
  }
  return secret ? 'unauthorized' : 'disabled';
}

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await isAuthorized(request);
  if (auth === 'disabled') {
    return json({ error: 'CRON_SECRET not configured and no internal admin session' }, { status: 503 });
  }
  if (auth === 'unauthorized') {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const infra: { db: 'ok' | 'fail'; redis: 'ok' | 'fail' | 'skipped' } = { db: 'fail', redis: 'skipped' };
  try {
    await withTimeout(getPrisma().$queryRaw`SELECT 1`, 4000);
    infra.db = 'ok';
  } catch {
    // stays 'fail'
  }
  const redis = getDeepHealthRedis();
  if (redis) {
    try {
      infra.redis = (await withTimeout(redis.ping(), 4000)) === 'PONG' ? 'ok' : 'fail';
    } catch {
      infra.redis = 'fail';
    }
  }

  let signals: OpsHealthSignal[] = [];
  let opsStatus: 'ok' | 'warn' | 'fail' = 'fail';
  if (infra.db === 'ok') {
    const snapshot = await collectOpsHealth();
    signals = snapshot.signals;
    opsStatus = snapshot.status;
  } else {
    signals = [{ name: 'opsSignals', status: 'fail', value: null, detail: 'DB unreachable — signal queries not attempted' }];
  }

  signals = [
    ...signals,
    {
      name: 'lastBackupAge',
      status: 'skipped',
      value: null,
      detail:
        'Backups are GitHub Actions artifacts (db-backup.yml); not queryable from this process — verified weekly by db-restore-verify.yml instead',
    },
  ];

  const overall: 'ok' | 'warn' | 'fail' =
    infra.db === 'fail' || infra.redis === 'fail' || opsStatus === 'fail' ? 'fail' : opsStatus;

  return json(
    { status: overall, checkedAt: new Date().toISOString(), infra, signals },
    { status: overall === 'fail' ? 503 : 200 },
  );
}

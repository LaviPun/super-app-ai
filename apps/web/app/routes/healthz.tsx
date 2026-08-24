/**
 * Liveness/readiness probe for Railway healthchecks + external uptime monitors.
 * Resource route (no default export): loader-only, unauthenticated, cheap.
 * DB failure => 503 (service is not usable). Redis failure => 503 only when
 * REDIS_URL is configured; absent Redis reports "skipped" (dev without Redis).
 *
 * Critical for production: both DB and Redis checks are bounded with timeouts
 * to prevent probe hangs if Postgres or Redis hangs mid-query.
 */
import { json } from '@remix-run/node';
import Redis from 'ioredis';
import { getPrisma } from '~/db.server';

let redisClient: Redis | null | undefined;

function getHealthRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL?.trim();
  redisClient = url
    ? new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        commandTimeout: 1500,
      })
    : null;
  return redisClient;
}

/**
 * Wraps a promise with a timeout, rejecting if the promise takes longer than ms.
 * Always clears the timeout to avoid dangling timers.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  });
}

export async function loader() {
  const checks: { db: 'ok' | 'fail'; redis: 'ok' | 'fail' | 'skipped' } = {
    db: 'fail',
    redis: 'skipped',
  };

  try {
    await withTimeout(getPrisma().$queryRaw`SELECT 1`, 4000);
    checks.db = 'ok';
  } catch {
    // stays 'fail'
  }

  const redis = getHealthRedis();
  if (redis) {
    try {
      checks.redis = (await withTimeout(redis.ping(), 4000)) === 'PONG' ? 'ok' : 'fail';
    } catch {
      checks.redis = 'fail';
    }
  }

  const ok = checks.db === 'ok' && checks.redis !== 'fail';
  return json({ ok, checks }, { status: ok ? 200 : 503 });
}

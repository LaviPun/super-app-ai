/**
 * Liveness/readiness probe for Railway healthchecks + external uptime monitors.
 * Resource route (no default export): loader-only, unauthenticated, cheap.
 * DB failure => 503 (service is not usable). Redis failure => 503 only when
 * REDIS_URL is configured; absent Redis reports "skipped" (dev without Redis).
 */
import { json } from '@remix-run/node';
import Redis from 'ioredis';
import { getPrisma } from '~/db.server';

let redisClient: Redis | null | undefined;

function getHealthRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL?.trim();
  redisClient = url
    ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 })
    : null;
  return redisClient;
}

export async function loader() {
  const checks: { db: 'ok' | 'fail'; redis: 'ok' | 'fail' | 'skipped' } = {
    db: 'fail',
    redis: 'skipped',
  };

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch {
    // stays 'fail'
  }

  const redis = getHealthRedis();
  if (redis) {
    try {
      checks.redis = (await redis.ping()) === 'PONG' ? 'ok' : 'fail';
    } catch {
      checks.redis = 'fail';
    }
  }

  const ok = checks.db === 'ok' && checks.redis !== 'fail';
  return json({ ok, checks }, { status: ok ? 200 : 503 });
}

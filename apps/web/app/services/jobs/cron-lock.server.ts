/**
 * Distributed cron tick lock (Redis `SET key token PX ttl NX` + a
 * compare-and-delete Lua release), shared by:
 *   - the worker's in-process scheduler (`cron-scheduler.server.ts`) — so N
 *     worker replicas never double-tick, and
 *   - the `/api/cron` HTTP route — so an external/manual trigger never
 *     overlaps an in-process tick either.
 *
 * The TTL is the safety net: a ticker that crashes mid-tick frees the lock
 * by the next slot without anyone cleaning up. Release is token-checked so a
 * slow ticker can never delete a lock a later ticker legitimately holds.
 */
import crypto from 'node:crypto';
import Redis from 'ioredis';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

export const CRON_LOCK_KEY = 'superapp:cron:tick-lock';

/** Structural subset of an ioredis client — anything with these two commands can back the lock. */
export interface CronLockClient {
  set(key: string, value: string, px: 'PX', ttlMs: number, nx: 'NX'): Promise<'OK' | null>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Returns the lock token when acquired, null when another ticker holds it. Throws on Redis errors. */
export async function acquireCronLock(client: CronLockClient, key: string, ttlMs: number): Promise<string | null> {
  const token = crypto.randomUUID();
  const reply = await client.set(key, token, 'PX', ttlMs, 'NX');
  return reply === 'OK' ? token : null;
}

/** True when this token's lock was deleted; false when it had already expired or belongs to someone else. */
export async function releaseCronLock(client: CronLockClient, key: string, token: string): Promise<boolean> {
  const reply = await client.eval(RELEASE_SCRIPT, 1, key, token);
  return Number(reply) === 1;
}

// ── HTTP-route helper ────────────────────────────────────────────────────────

export type HttpCronLock =
  | { status: 'acquired'; release: () => Promise<void> }
  | { status: 'locked' }
  | { status: 'unavailable'; reason: string };

let httpLockClient: Redis | null | undefined;

function getHttpLockClient(): Redis | null {
  if (httpLockClient !== undefined) return httpLockClient;
  const url = process.env.REDIS_URL?.trim();
  // Short, bounded timeouts: the route must answer even when Redis is down.
  httpLockClient = url
    ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500, commandTimeout: 1500 })
    : null;
  return httpLockClient;
}

/**
 * Lock for the `/api/cron` route. Degrades to `'unavailable'` (the route then
 * runs unlocked, with a warning) rather than failing: a manual trigger must
 * keep working during a Redis incident — the sweeps themselves are CAS-guarded
 * against overlap; the lock is the polite layer on top.
 */
export async function acquireHttpCronLock(ttlMs: number): Promise<HttpCronLock> {
  const client = getHttpLockClient();
  if (!client) return { status: 'unavailable', reason: 'REDIS_URL not set' };
  try {
    const token = await acquireCronLock(client, CRON_LOCK_KEY, ttlMs);
    if (!token) return { status: 'locked' };
    return {
      status: 'acquired',
      release: async () => {
        try {
          await releaseCronLock(client, CRON_LOCK_KEY, token);
        } catch (err) {
          logger.warn('[cron-lock] release failed — lock expires with its TTL', safeErrorMeta(err));
        }
      },
    };
  } catch (err) {
    logger.warn('[cron-lock] Redis unavailable — running the HTTP cron tick unlocked', safeErrorMeta(err));
    return { status: 'unavailable', reason: 'redis error' };
  }
}

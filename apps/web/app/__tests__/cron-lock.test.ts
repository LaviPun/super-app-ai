import { describe, expect, it, vi } from 'vitest';
import { acquireCronLock, releaseCronLock, type CronLockClient } from '~/services/jobs/cron-lock.server';

/**
 * In-memory stand-in for the two Redis commands the cron lock uses:
 * `SET key value PX ttl NX` and the compare-and-delete Lua release script.
 */
function fakeRedis(): CronLockClient & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (key: string, value: string, _px: 'PX', _ttl: number, _nx: 'NX') => {
      if (store.has(key)) return null;
      store.set(key, value);
      return 'OK' as const;
    }),
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
      if (store.get(key) === token) {
        store.delete(key);
        return 1;
      }
      return 0;
    }),
  };
}

describe('cron lock (SET NX PX + compare-and-delete release)', () => {
  it('acquires when free and returns a token; a second acquire while held returns null', async () => {
    const redis = fakeRedis();
    const token = await acquireCronLock(redis, 'lock:test', 5_000);
    expect(token).toEqual(expect.any(String));
    expect(redis.set).toHaveBeenCalledWith('lock:test', token, 'PX', 5_000, 'NX');

    const second = await acquireCronLock(redis, 'lock:test', 5_000);
    expect(second).toBeNull();
  });

  it('releases only with the matching token (never deletes another ticker\'s lock)', async () => {
    const redis = fakeRedis();
    const token = (await acquireCronLock(redis, 'lock:test', 5_000))!;

    expect(await releaseCronLock(redis, 'lock:test', 'someone-elses-token')).toBe(false);
    expect(redis.store.has('lock:test')).toBe(true);

    expect(await releaseCronLock(redis, 'lock:test', token)).toBe(true);
    expect(redis.store.has('lock:test')).toBe(false);

    // Lock is free again for the next ticker.
    expect(await acquireCronLock(redis, 'lock:test', 5_000)).toEqual(expect.any(String));
  });
});

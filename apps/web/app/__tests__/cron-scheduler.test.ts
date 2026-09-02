import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CronTickResult } from '~/services/jobs/cron-tick-result';

/**
 * In-process cron scheduler (worker) — closes the never-reliably-scheduled
 * /api/cron gap. Contract under test:
 *   - lock acquired → the tick runs, is logged as a CRON_TICK activity row with
 *     per-sweep counts + duration, and the lock is released afterwards
 *   - lock held elsewhere → skipped (logged, no ErrorLog — that's normal in a
 *     multi-replica deploy)
 *   - tick throws → ErrorLog row with the tick's correlation id, scheduler
 *     keeps ticking (D8: loud, never a crash-loop)
 *   - kill switch off → no timers are ever armed
 *   - tick exceeds its budget → 'timeout' outcome, ErrorLog row, the lock is
 *     left to expire with its TTL (the runaway tick is still running), and the
 *     next scheduled tick is skipped as in-flight until it settles
 */

// Keep the test light: the real cron-tick module pulls in the entire sweep
// graph (flow runner, Shopify client, Prisma …). The scheduler receives the
// tick function by injection anyway.
vi.mock('~/services/jobs/cron-tick.server', () => ({
  runCronTick: vi.fn(),
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({}),
}));

import { CRON_LOCK_KEY, type CronLockClient } from '~/services/jobs/cron-lock.server';
import {
  CRON_TICK_TIMEOUT_FLOOR_MS,
  CRON_TICK_TIMEOUT_MARGIN_MS,
  resolveCronTickTimeoutMs,
  startCronScheduler,
  type CronSchedulerHandle,
} from '~/services/jobs/cron-scheduler.server';

function fakeRedis(opts: { held?: boolean; failAcquire?: boolean } = {}) {
  const store = new Map<string, string>();
  if (opts.held) store.set(CRON_LOCK_KEY, 'other-ticker');
  const client: CronLockClient & { store: Map<string, string> } = {
    store,
    set: vi.fn(async (key: string, value: string) => {
      if (opts.failAcquire) throw new Error('ECONNREFUSED redis');
      if (store.has(key)) return null;
      store.set(key, value);
      return 'OK' as const;
    }),
    eval: vi.fn(async (_script: string, _n: number, key: string, token: string) => {
      if (store.get(key) === token) {
        store.delete(key);
        return 1;
      }
      return 0;
    }),
  };
  return client;
}

function tickResult(overrides: Partial<CronTickResult> = {}): CronTickResult {
  return {
    ran: 2,
    results: [
      { scheduleId: 's1', shopDomain: 'a.myshopify.com', ok: true },
      { scheduleId: 's2', shopDomain: 'b.myshopify.com', ok: false, error: 'boom' },
    ],
    resumeSweep: [{ runId: 'r1', tenantId: 'a.myshopify.com', status: 'SUCCEEDED' }],
    httpSyncReplay: [],
    uninstallCleanup: { processed: 1, succeeded: 1, failed: 0, jobs: [] },
    auditRetention: null,
    chatRetention: null,
    loyaltyExpiry: null,
    planSyncSweep: { synced: 0, failed: 0 },
    stuckJobSweep: { swept: 0, failedPermanently: 0 },
    opsHealthSweep: { status: 'ok', alertsFired: [] },
    ...overrides,
  } as CronTickResult;
}

type ErrorLogCall = (message: string, stack?: string, meta?: unknown, err?: unknown, source?: string) => Promise<void>;
type ActivityCall = (input: { actor: string; action: string; details?: Record<string, unknown> }) => Promise<void>;

describe('startCronScheduler', () => {
  const errorLog = { error: vi.fn<ErrorLogCall>(async () => {}) };
  const activity = { log: vi.fn<ActivityCall>(async () => {}) };
  let handle: CronSchedulerHandle | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    errorLog.error.mockClear();
    activity.log.mockClear();
  });

  afterEach(() => {
    handle?.stop();
    handle = null;
    vi.useRealTimers();
  });

  it('runs the tick when the lock is acquired, records a CRON_TICK row with counts + duration, and releases the lock', async () => {
    const redis = fakeRedis();
    const runTick = vi.fn(async () => tickResult());
    handle = startCronScheduler({ redis, runTick, errorLog, activity, enabled: true, intervalMs: 60_000 });

    const outcome = await handle.tickNow();

    expect(outcome.status).toBe('ran');
    expect(runTick).toHaveBeenCalledTimes(1);
    // Lock TTL equals the interval so a crashed ticker frees itself by the next slot.
    expect(redis.set).toHaveBeenCalledWith(CRON_LOCK_KEY, expect.any(String), 'PX', 60_000, 'NX');
    expect(redis.store.has(CRON_LOCK_KEY)).toBe(false); // released
    expect(errorLog.error).not.toHaveBeenCalled();

    expect(activity.log).toHaveBeenCalledTimes(1);
    const row = activity.log.mock.calls[0]![0];
    expect(row.actor).toBe('CRON');
    expect(row.action).toBe('CRON_TICK');
    expect(row.details).toMatchObject({
      outcome: 'ok',
      durationMs: expect.any(Number),
      correlationId: expect.stringMatching(/^cron_/),
      schedulesRan: 2,
      scheduleFailures: 1,
      workflowsResumed: 1,
      uninstallCleanupProcessed: 1,
      opsHealth: 'ok',
    });
  });

  it('skips (without an ErrorLog row) when another ticker holds the lock', async () => {
    const redis = fakeRedis({ held: true });
    const runTick = vi.fn(async () => tickResult());
    handle = startCronScheduler({ redis, runTick, errorLog, activity, enabled: true, intervalMs: 60_000 });

    const outcome = await handle.tickNow();

    expect(outcome).toEqual({ status: 'skipped', reason: 'locked' });
    expect(runTick).not.toHaveBeenCalled();
    expect(errorLog.error).not.toHaveBeenCalled();
    expect(activity.log).not.toHaveBeenCalled();
    // Never touches a lock it does not own.
    expect(redis.store.get(CRON_LOCK_KEY)).toBe('other-ticker');
  });

  it('writes an ErrorLog row (with the correlation id) when the tick throws, and keeps ticking afterwards', async () => {
    const redis = fakeRedis();
    const runTick = vi
      .fn<() => Promise<CronTickResult>>()
      .mockRejectedValueOnce(new Error('db exploded'))
      .mockResolvedValueOnce(tickResult());
    handle = startCronScheduler({ redis, runTick, errorLog, activity, enabled: true, intervalMs: 60_000 });

    const first = await handle.tickNow();
    expect(first.status).toBe('failed');
    expect(errorLog.error).toHaveBeenCalledTimes(1);
    const [message, stack, meta, err, source] = errorLog.error.mock.calls[0]!;
    expect(message).toContain('tick failed');
    expect(stack).toContain('db exploded');
    expect(meta).toMatchObject({ correlationId: expect.stringMatching(/^cron_/), durationMs: expect.any(Number) });
    expect(err).toBeInstanceOf(Error);
    expect(source).toBe('SERVER');
    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'CRON', action: 'CRON_TICK_FAILED', details: expect.objectContaining({ outcome: 'failed' }) }),
    );
    expect(redis.store.has(CRON_LOCK_KEY)).toBe(false); // released even on failure

    const second = await handle.tickNow();
    expect(second.status).toBe('ran');
    expect(runTick).toHaveBeenCalledTimes(2);
  });

  it('treats a Redis failure during lock acquisition as a loud failure (no unlocked tick, no crash)', async () => {
    const redis = fakeRedis({ failAcquire: true });
    const runTick = vi.fn(async () => tickResult());
    handle = startCronScheduler({ redis, runTick, errorLog, activity, enabled: true, intervalMs: 60_000 });

    const outcome = await handle.tickNow();

    expect(outcome.status).toBe('failed');
    expect(runTick).not.toHaveBeenCalled();
    expect(errorLog.error).toHaveBeenCalledTimes(1);
    expect(errorLog.error.mock.calls[0]![0]).toContain('lock');
  });

  it('arms no timers when the kill switch is off (external scheduler takes over)', async () => {
    const redis = fakeRedis();
    const runTick = vi.fn(async () => tickResult());
    handle = startCronScheduler({
      redis,
      runTick,
      errorLog,
      activity,
      enabled: false,
      intervalMs: 60_000,
      firstTickDelayMs: 1_000,
    });

    expect(handle.enabled).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(runTick).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('ticks ~30s after boot and then every interval until stopped', async () => {
    const redis = fakeRedis();
    const runTick = vi.fn(async () => tickResult());
    handle = startCronScheduler({
      redis,
      runTick,
      errorLog,
      activity,
      enabled: true,
      intervalMs: 60_000,
      firstTickDelayMs: 30_000,
    });

    await vi.advanceTimersByTimeAsync(29_000);
    expect(runTick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runTick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runTick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runTick).toHaveBeenCalledTimes(3);

    handle.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(runTick).toHaveBeenCalledTimes(3);
  });

  it('times out a tick that exceeds its budget, logs it, leaves the lock to its TTL, and skips overlapping ticks as in-flight', async () => {
    const redis = fakeRedis();
    let settleRunaway: (r: CronTickResult) => void = () => {};
    // First call: a runaway tick we control; later calls: normal fast ticks.
    const runTick = vi
      .fn<() => Promise<CronTickResult>>(async () => tickResult())
      .mockImplementationOnce(
        () =>
          new Promise<CronTickResult>((resolve) => {
            settleRunaway = resolve;
          }),
      );
    handle = startCronScheduler({
      redis,
      runTick,
      errorLog,
      activity,
      enabled: true,
      intervalMs: 60_000,
      timeoutMs: 5_000,
    });

    const pending = handle.tickNow();
    await vi.advanceTimersByTimeAsync(5_000);
    const outcome = await pending;

    expect(outcome.status).toBe('timeout');
    expect(errorLog.error).toHaveBeenCalledTimes(1);
    expect(errorLog.error.mock.calls[0]![0]).toContain('timed out');
    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CRON_TICK_FAILED', details: expect.objectContaining({ outcome: 'timeout' }) }),
    );
    // The runaway tick is still running: do NOT release the lock under it.
    expect(redis.eval).not.toHaveBeenCalled();
    expect(redis.store.has(CRON_LOCK_KEY)).toBe(true);

    // Next slot while the runaway tick is still in flight → skipped, not doubled.
    const overlapping = await handle.tickNow();
    expect(overlapping).toEqual({ status: 'skipped', reason: 'in-flight' });
    expect(runTick).toHaveBeenCalledTimes(1);

    // Once the runaway tick finally settles, the lock is released (token-checked)
    // and the scheduler is free to tick again.
    settleRunaway(tickResult());
    await vi.advanceTimersByTimeAsync(0);
    expect(redis.store.has(CRON_LOCK_KEY)).toBe(false);
    const after = await handle.tickNow();
    expect(after.status).toBe('ran');
    expect(runTick).toHaveBeenCalledTimes(2);
  });

  it('never rejects even if the bookkeeping sinks throw', async () => {
    const redis = fakeRedis();
    const runTick = vi.fn(async () => {
      throw new Error('tick broke');
    });
    const brokenErrorLog = { error: vi.fn<ErrorLogCall>(async () => { throw new Error('errorlog down'); }) };
    const brokenActivity = { log: vi.fn<ActivityCall>(async () => { throw new Error('activity down'); }) };
    handle = startCronScheduler({
      redis,
      runTick,
      errorLog: brokenErrorLog,
      activity: brokenActivity,
      enabled: true,
      intervalMs: 60_000,
    });

    await expect(handle.tickNow()).resolves.toMatchObject({ status: 'failed' });
  });
});

describe('resolveCronTickTimeoutMs', () => {
  it('is interval minus the margin, floored so a 1-minute interval still gets a real budget', () => {
    expect(resolveCronTickTimeoutMs(5 * 60_000)).toBe(5 * 60_000 - CRON_TICK_TIMEOUT_MARGIN_MS);
    expect(resolveCronTickTimeoutMs(60_000)).toBe(Math.max(CRON_TICK_TIMEOUT_FLOOR_MS, 60_000 - CRON_TICK_TIMEOUT_MARGIN_MS));
    expect(resolveCronTickTimeoutMs(10_000)).toBe(CRON_TICK_TIMEOUT_FLOOR_MS);
  });
});

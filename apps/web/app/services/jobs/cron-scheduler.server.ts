/**
 * In-process cron scheduler for the Railway `worker` service (2026-09).
 *
 * Why it exists: `/api/cron` had no reliable caller. The GitHub Actions
 * `cron.yml` every-5-minutes schedule is best-effort and in practice fired
 * every 2–5 HOURS (21 runs in 3 days, not 864), so every scheduled sweep —
 * flow/messaging/httpSync schedules, workflow resume, DLQ replay, plan
 * reconciliation, stuck-job sweep, the ops-health heartbeat — effectively
 * only ran a handful of times a day (issue #51: heartbeat 209 min stale).
 * The worker already runs 24/7 with DB + Redis, so it now drives the tick
 * itself — no external dependency, no secrets outside Railway.
 *
 * Guarantees:
 *   - single ticker: Redis lock (SET NX PX, TTL = interval) — replicas skip
 *     (logged, no error) when another one holds it
 *   - deadline: a tick is abandoned after `interval − 30s` (floor 15s); the
 *     runaway promise keeps its lock until it settles or the TTL expires,
 *     and the next slot is skipped as in-flight rather than doubled
 *   - loud, never fatal (D8): every failure is an ErrorLog row carrying the
 *     tick's correlation id + a CRON_TICK_FAILED activity row; `tickNow()`
 *     never rejects, so the interval can never crash-loop the worker
 *   - kill switch: CRON_SCHEDULER_ENABLED=false arms no timers (an external
 *     scheduler hitting /api/cron takes over; the lock is shared with it)
 *
 * The heartbeat `/healthz/deep` measures (`AppSettings.cronLastTickAt`) is
 * written inside the tick by the ops-health sweep, not here — see
 * `cron-tick.server.ts` for why it stays last.
 */
import { getCronTickIntervalMs, isCronSchedulerEnabled } from '~/env.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { generateCorrelationId, runWithRequestContext } from '~/services/observability/correlation.server';
import { ErrorLogService } from '~/services/observability/error-log.service';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import { CRON_LOCK_KEY, acquireCronLock, releaseCronLock, type CronLockClient } from './cron-lock.server';
import { runCronTick as defaultRunCronTick } from './cron-tick.server';
import { summarizeCronTick, type CronTickResult } from './cron-tick-result';

export const CRON_FIRST_TICK_DELAY_MS = 30_000;
export const CRON_TICK_TIMEOUT_MARGIN_MS = 30_000;
export const CRON_TICK_TIMEOUT_FLOOR_MS = 15_000;
/** Lock acquisition must not hang on a BullMQ-style `maxRetriesPerRequest: null` connection while Redis is down. */
export const CRON_LOCK_ACQUIRE_TIMEOUT_MS = 10_000;

export function resolveCronTickTimeoutMs(intervalMs: number): number {
  return Math.max(CRON_TICK_TIMEOUT_FLOOR_MS, intervalMs - CRON_TICK_TIMEOUT_MARGIN_MS);
}

export type CronTickOutcome =
  | { status: 'ran'; durationMs: number; result: CronTickResult }
  | { status: 'skipped'; reason: 'locked' | 'in-flight' }
  | { status: 'failed'; durationMs: number; error: unknown }
  | { status: 'timeout'; durationMs: number };

export interface CronSchedulerDeps {
  redis: CronLockClient;
  /** Default: CRON_SCHEDULER_ENABLED (true unless explicitly off). */
  enabled?: boolean;
  /** Default: CRON_TICK_INTERVAL_MINUTES (5) in ms. Also the lock TTL. */
  intervalMs?: number;
  firstTickDelayMs?: number;
  /** Default: `resolveCronTickTimeoutMs(intervalMs)`. */
  timeoutMs?: number;
  runTick?: () => Promise<CronTickResult>;
  errorLog?: Pick<ErrorLogService, 'error'>;
  activity?: Pick<ActivityLogService, 'log'>;
  lockKey?: string;
}

export interface CronSchedulerHandle {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  /** Run one tick now (used by the timers and by tests). Never rejects. */
  tickNow(): Promise<CronTickOutcome>;
  stop(): void;
}

class CronTickTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`cron tick exceeded its ${timeoutMs}ms budget`);
    this.name = 'CronTickTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function startCronScheduler(deps: CronSchedulerDeps): CronSchedulerHandle {
  const enabled = deps.enabled ?? isCronSchedulerEnabled();
  const intervalMs = deps.intervalMs ?? getCronTickIntervalMs();
  const firstTickDelayMs = deps.firstTickDelayMs ?? CRON_FIRST_TICK_DELAY_MS;
  const timeoutMs = deps.timeoutMs ?? resolveCronTickTimeoutMs(intervalMs);
  const runTick = deps.runTick ?? defaultRunCronTick;
  const errorLog = deps.errorLog ?? new ErrorLogService();
  const activity = deps.activity ?? new ActivityLogService();
  const lockKey = deps.lockKey ?? CRON_LOCK_KEY;
  const { redis } = deps;

  let inFlight = false;
  let stopped = false;
  let firstTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  const recordActivity = async (
    action: 'CRON_TICK' | 'CRON_TICK_FAILED',
    details: Record<string, unknown>,
  ): Promise<void> => {
    try {
      await activity.log({ actor: 'CRON', action, details });
    } catch (err) {
      logger.warn('[cron-scheduler] could not write activity row', safeErrorMeta(err));
    }
  };

  const recordError = async (message: string, err: unknown, meta: Record<string, unknown>): Promise<void> => {
    try {
      const stack = err instanceof Error ? err.stack : undefined;
      await errorLog.error(message, stack, meta, err, 'SERVER');
    } catch (logErr) {
      logger.warn('[cron-scheduler] could not write ErrorLog row', safeErrorMeta(logErr));
    }
  };

  const releaseQuietly = async (token: string, correlationId: string): Promise<void> => {
    try {
      await releaseCronLock(redis, lockKey, token);
    } catch (err) {
      logger.warn('[cron-scheduler] lock release failed — lock expires with its TTL', { correlationId, ...safeErrorMeta(err) });
    }
  };

  const executeTick = async (correlationId: string): Promise<CronTickOutcome> => {
    const startedAt = Date.now();

    let token: string | null;
    try {
      token = await withTimeout(
        acquireCronLock(redis, lockKey, intervalMs),
        CRON_LOCK_ACQUIRE_TIMEOUT_MS,
        () => new Error(`cron lock acquisition exceeded ${CRON_LOCK_ACQUIRE_TIMEOUT_MS}ms`),
      );
    } catch (err) {
      // Without the lock we cannot guarantee a single ticker, so we do NOT run
      // unlocked — we fail loudly. Redis being down is already a /healthz fail,
      // and the missed heartbeat surfaces on /healthz/deep as cron staleness.
      const durationMs = Date.now() - startedAt;
      logger.error('[cron-scheduler] cron lock unavailable — tick skipped', { correlationId, durationMs, ...safeErrorMeta(err) });
      await recordError('[cron-scheduler] cron lock unavailable — tick skipped', err, { correlationId, durationMs, lockKey });
      await recordActivity('CRON_TICK_FAILED', { outcome: 'lock-unavailable', correlationId, durationMs });
      inFlight = false;
      return { status: 'failed', durationMs, error: err };
    }

    if (!token) {
      logger.info('[cron-scheduler] tick skipped — lock held by another ticker', { correlationId, lockKey });
      inFlight = false;
      return { status: 'skipped', reason: 'locked' };
    }

    const tickPromise = runTick();
    try {
      const result = await withTimeout(tickPromise, timeoutMs, () => new CronTickTimeoutError(timeoutMs));
      const durationMs = Date.now() - startedAt;
      const summary = summarizeCronTick(result);
      logger.info('[cron-scheduler] tick complete', { actor: 'system', correlationId, durationMs, ...summary });
      await recordActivity('CRON_TICK', { outcome: 'ok', correlationId, durationMs, ...summary });
      await releaseQuietly(token, correlationId);
      inFlight = false;
      return { status: 'ran', durationMs, result };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      if (err instanceof CronTickTimeoutError) {
        // The tick is still running. Leave its lock alone (TTL = interval)
        // and keep `inFlight` set until it settles so the next slot is
        // skipped rather than doubled; release the lock (token-checked) when
        // it finally does.
        logger.error('[cron-scheduler] tick timed out — abandoning wait; lock left to its TTL', {
          correlationId,
          durationMs,
          timeoutMs,
        });
        await recordError('[cron-scheduler] tick timed out', err, { correlationId, durationMs, timeoutMs });
        await recordActivity('CRON_TICK_FAILED', { outcome: 'timeout', correlationId, durationMs, timeoutMs });
        void tickPromise
          .then(
            () => logger.warn('[cron-scheduler] timed-out tick eventually completed', { correlationId, durationMs: Date.now() - startedAt }),
            (lateErr: unknown) =>
              logger.error('[cron-scheduler] timed-out tick eventually failed', { correlationId, ...safeErrorMeta(lateErr) }),
          )
          .finally(async () => {
            await releaseQuietly(token, correlationId);
            inFlight = false;
          });
        return { status: 'timeout', durationMs };
      }

      logger.error('[cron-scheduler] tick failed', { correlationId, durationMs, ...safeErrorMeta(err) });
      await recordError('[cron-scheduler] tick failed', err, { correlationId, durationMs });
      await recordActivity('CRON_TICK_FAILED', {
        outcome: 'failed',
        correlationId,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      await releaseQuietly(token, correlationId);
      inFlight = false;
      return { status: 'failed', durationMs, error: err };
    }
  };

  const tickNow = async (): Promise<CronTickOutcome> => {
    if (inFlight) {
      logger.warn('[cron-scheduler] previous tick still in flight — skipping this slot');
      return { status: 'skipped', reason: 'in-flight' };
    }
    inFlight = true;
    const correlationId = `cron_${generateCorrelationId().slice('corr_'.length)}`;
    try {
      return await runWithRequestContext({ correlationId, actor: 'system' }, () => executeTick(correlationId));
    } catch (err) {
      // executeTick handles its own failures; this is the last line of defence
      // so a bug in the bookkeeping can never reject into a bare setInterval.
      inFlight = false;
      logger.error('[cron-scheduler] unexpected scheduler failure', { correlationId, ...safeErrorMeta(err) });
      return { status: 'failed', durationMs: 0, error: err };
    }
  };

  const stop = (): void => {
    stopped = true;
    if (firstTimer) clearTimeout(firstTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    firstTimer = null;
    intervalTimer = null;
  };

  if (!enabled) {
    logger.warn('[cron-scheduler] disabled (CRON_SCHEDULER_ENABLED=false) — /api/cron must be driven by an external scheduler');
    return { enabled, intervalMs, timeoutMs, tickNow, stop };
  }

  firstTimer = setTimeout(() => {
    firstTimer = null;
    if (stopped) return;
    void tickNow();
    intervalTimer = setInterval(() => void tickNow(), intervalMs);
  }, firstTickDelayMs);

  logger.info('[cron-scheduler] started', { intervalMs, firstTickDelayMs, timeoutMs, lockKey });
  return { enabled, intervalMs, timeoutMs, tickNow, stop };
}

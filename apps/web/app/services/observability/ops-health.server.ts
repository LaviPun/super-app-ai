import { getPrisma } from '~/db.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import { OpsAlertService } from '~/services/observability/ops-alert.server';
import { checkDailySpend, type SpendCheck } from '~/services/observability/ai-spend-guard.server';

/**
 * Ops health signals (DevOps hardening 2026-09, items c + d).
 *
 * One module computes the operational signals that were previously invisible
 * until someone opened the right internal-admin page:
 *   - queue backlog (QUEUED Job rows sitting unclaimed)
 *   - stuck RUNNING jobs (older than the sweep's own staleness window)
 *   - DLQ depth (FAILED Job rows in the last 24h — the replay backlog)
 *   - error-rate spike (ErrorLog ERROR rows in the last 15 min)
 *   - cron heartbeat staleness (AppSettings.cronLastTickAt)
 *   - AI daily spend vs cap (ai-spend-guard.server.ts)
 *
 * Consumers:
 *   - `runOpsHealthSweep()` — called from /api/cron every tick: writes the
 *     heartbeat, persists the snapshot to AppSettings.opsHealthSnapshot, and
 *     fires ops alerts (through the existing WS-G OpsAlertService seam, so the
 *     moment the owner configures Slack/email/Sentry it all lights up; until
 *     then every breach still lands as an OPS_ALERT_OCCURRED ActivityLog row
 *     visible in /internal/activity — no silent failure).
 *   - `/healthz/deep` — recomputes live signals plus db/redis probes.
 *   - the internal admin shell — reads the persisted snapshot (one row) and
 *     shows a banner when anything is warn/fail.
 *
 * Thresholds are constants here (documented in docs/runbooks/deploy-and-rollback.md
 * §monitoring) rather than 12 new env vars — change them in code, with review.
 */

export type OpsCheckStatus = 'ok' | 'warn' | 'fail' | 'skipped';

export interface OpsHealthSignal {
  name: string;
  status: OpsCheckStatus;
  /** The measured value (count, minutes, cents — see `detail`). */
  value: number | null;
  detail: string;
}

export interface OpsHealthSnapshot {
  /** Worst signal status: fail > warn > ok. 'skipped' signals never degrade the overall. */
  status: Exclude<OpsCheckStatus, 'skipped'>;
  checkedAt: string; // ISO
  signals: OpsHealthSignal[];
}

// ── Thresholds ───────────────────────────────────────────────────────────────
export const QUEUE_BACKLOG_STALE_MIN = 10; // a QUEUED row older than this counts as backlog
export const QUEUE_BACKLOG_WARN = 25;
export const QUEUE_BACKLOG_FAIL = 100;
export const STUCK_RUNNING_STALE_MIN = 15; // matches stuck-job-sweep DEFAULT_STALE_AFTER_MS
export const STUCK_RUNNING_WARN = 1;
export const STUCK_RUNNING_FAIL = 10;
export const DLQ_WINDOW_HOURS = 24;
export const DLQ_WARN = 10;
export const DLQ_FAIL = 50;
export const ERROR_SPIKE_WINDOW_MIN = 15;
export const ERROR_SPIKE_WARN = 25;
export const ERROR_SPIKE_FAIL = 100;
export const CRON_STALE_WARN_MIN = 15; // 3 missed 5-min ticks
export const CRON_STALE_FAIL_MIN = 60;

// ── Pure classifiers (exported for tests) ────────────────────────────────────

function classifyCount(name: string, count: number, warnAt: number, failAt: number, detail: string): OpsHealthSignal {
  const status: OpsCheckStatus = count >= failAt ? 'fail' : count >= warnAt ? 'warn' : 'ok';
  return { name, status, value: count, detail };
}

export function classifyQueueBacklog(count: number): OpsHealthSignal {
  return classifyCount(
    'queueBacklog',
    count,
    QUEUE_BACKLOG_WARN,
    QUEUE_BACKLOG_FAIL,
    `Job rows QUEUED for > ${QUEUE_BACKLOG_STALE_MIN} min (warn ≥ ${QUEUE_BACKLOG_WARN}, fail ≥ ${QUEUE_BACKLOG_FAIL})`,
  );
}

export function classifyStuckRunning(count: number): OpsHealthSignal {
  return classifyCount(
    'stuckRunning',
    count,
    STUCK_RUNNING_WARN,
    STUCK_RUNNING_FAIL,
    `Job rows RUNNING for > ${STUCK_RUNNING_STALE_MIN} min (warn ≥ ${STUCK_RUNNING_WARN}, fail ≥ ${STUCK_RUNNING_FAIL})`,
  );
}

export function classifyDlqDepth(count: number): OpsHealthSignal {
  return classifyCount(
    'dlqDepth',
    count,
    DLQ_WARN,
    DLQ_FAIL,
    `FAILED jobs in the last ${DLQ_WINDOW_HOURS}h awaiting replay (warn ≥ ${DLQ_WARN}, fail ≥ ${DLQ_FAIL})`,
  );
}

export function classifyErrorSpike(count: number): OpsHealthSignal {
  return classifyCount(
    'errorSpike',
    count,
    ERROR_SPIKE_WARN,
    ERROR_SPIKE_FAIL,
    `ErrorLog ERROR rows in the last ${ERROR_SPIKE_WINDOW_MIN} min (warn ≥ ${ERROR_SPIKE_WARN}, fail ≥ ${ERROR_SPIKE_FAIL})`,
  );
}

export function classifyCronStaleness(lastTickAt: Date | null, now: Date): OpsHealthSignal {
  if (!lastTickAt) {
    return {
      name: 'cronHeartbeat',
      status: 'skipped',
      value: null,
      detail: 'No cron tick recorded yet (heartbeat lands on the first /api/cron call after this deploy)',
    };
  }
  const ageMin = Math.floor((now.getTime() - lastTickAt.getTime()) / 60_000);
  const status: OpsCheckStatus = ageMin >= CRON_STALE_FAIL_MIN ? 'fail' : ageMin >= CRON_STALE_WARN_MIN ? 'warn' : 'ok';
  return {
    name: 'cronHeartbeat',
    status,
    value: ageMin,
    detail: `Minutes since last /api/cron tick (warn ≥ ${CRON_STALE_WARN_MIN}, fail ≥ ${CRON_STALE_FAIL_MIN})`,
  };
}

export function spendToSignal(check: SpendCheck): OpsHealthSignal {
  return {
    name: 'aiSpend',
    status: check.status,
    value: check.spentCents,
    detail:
      check.capCents == null
        ? 'Daily AI spend cap disabled (cap ≤ 0)'
        : `Today's AI spend in cents vs daily soft cap ${check.capCents}¢ (warn ≥ 80%, fail ≥ 100%) — observability only, nothing is blocked`,
  };
}

export function overallStatus(signals: OpsHealthSignal[]): OpsHealthSnapshot['status'] {
  if (signals.some((s) => s.status === 'fail')) return 'fail';
  if (signals.some((s) => s.status === 'warn')) return 'warn';
  return 'ok';
}

// ── Collection against the live DB ───────────────────────────────────────────

export async function collectOpsHealth(now: Date = new Date()): Promise<OpsHealthSnapshot> {
  const prisma = getPrisma();
  const queuedCutoff = new Date(now.getTime() - QUEUE_BACKLOG_STALE_MIN * 60_000);
  const runningCutoff = new Date(now.getTime() - STUCK_RUNNING_STALE_MIN * 60_000);
  const dlqSince = new Date(now.getTime() - DLQ_WINDOW_HOURS * 3_600_000);
  const errSince = new Date(now.getTime() - ERROR_SPIKE_WINDOW_MIN * 60_000);

  // Each query is individually guarded: one unreadable table must degrade that
  // one signal (to a loud 'fail' with a detail, not a silent 'ok') rather than
  // sink the whole snapshot. D8: no silent failures.
  const guarded = async (name: string, fn: () => Promise<number>): Promise<number | null> => {
    try {
      return await fn();
    } catch (err) {
      logger.error(`[ops-health] signal query failed: ${name}`, safeErrorMeta(err));
      return null;
    }
  };

  const [queueBacklog, stuckRunning, dlqDepth, errorSpike, settingsRow, spend] = await Promise.all([
    guarded('queueBacklog', () => prisma.job.count({ where: { status: 'QUEUED', createdAt: { lte: queuedCutoff } } })),
    guarded('stuckRunning', () => prisma.job.count({ where: { status: 'RUNNING', startedAt: { lte: runningCutoff } } })),
    guarded('dlqDepth', () => prisma.job.count({ where: { status: 'FAILED', finishedAt: { gte: dlqSince } } })),
    guarded('errorSpike', () => prisma.errorLog.count({ where: { level: 'ERROR', createdAt: { gte: errSince } } })),
    prisma.appSettings
      .findUnique({ where: { id: 'singleton' }, select: { cronLastTickAt: true, aiDailySpendCapCents: true } })
      .catch(() => null),
    checkDailySpend({ now }).catch((err) => {
      logger.error('[ops-health] spend check failed', safeErrorMeta(err));
      return null;
    }),
  ]);

  const unreadable = (name: string, detail: string): OpsHealthSignal => ({
    name,
    status: 'fail',
    value: null,
    detail: `${detail} — the underlying query FAILED (see ErrorLog); treating an unreadable signal as unhealthy`,
  });

  const signals: OpsHealthSignal[] = [
    queueBacklog == null ? unreadable('queueBacklog', 'Queue backlog') : classifyQueueBacklog(queueBacklog),
    stuckRunning == null ? unreadable('stuckRunning', 'Stuck RUNNING jobs') : classifyStuckRunning(stuckRunning),
    dlqDepth == null ? unreadable('dlqDepth', 'DLQ depth') : classifyDlqDepth(dlqDepth),
    errorSpike == null ? unreadable('errorSpike', 'Error spike') : classifyErrorSpike(errorSpike),
    classifyCronStaleness(settingsRow?.cronLastTickAt ?? null, now),
    spend == null ? unreadable('aiSpend', 'AI daily spend') : spendToSignal(spend),
  ];

  return { status: overallStatus(signals), checkedAt: now.toISOString(), signals };
}

// ── Cron sweep: heartbeat + snapshot + alerts ────────────────────────────────

export interface OpsHealthSweepResult {
  status: OpsHealthSnapshot['status'];
  alertsFired: string[];
}

/** Test seam: the sweep only needs `fire`. */
export type OpsAlertFirer = Pick<OpsAlertService, 'fire'>;

/**
 * Called from /api/cron every tick (own try/catch there — a sweep failure never
 * 500s the tick). Order matters: the heartbeat is written FIRST so the
 * staleness signal measures the scheduler, not this sweep's own health.
 */
export async function runOpsHealthSweep(deps: { alerts?: OpsAlertFirer; now?: Date } = {}): Promise<OpsHealthSweepResult> {
  const now = deps.now ?? new Date();
  const prisma = getPrisma();
  const alerts = deps.alerts ?? new OpsAlertService();

  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    update: { cronLastTickAt: now },
    create: { id: 'singleton', cronLastTickAt: now },
  });

  const snapshot = await collectOpsHealth(now);

  await prisma.appSettings
    .update({ where: { id: 'singleton' }, data: { opsHealthSnapshot: JSON.stringify(snapshot) } })
    .catch((err) => logger.error('[ops-health] failed to persist snapshot', safeErrorMeta(err)));

  // Alert only on 'fail' signals — 'warn' stays visible (admin banner, deep
  // health, activity log) without paging. OpsAlertService's own rolling-window
  // threshold + per-kind cooldown de-dupes a persistent breach across ticks.
  const alertsFired: string[] = [];
  for (const signal of snapshot.signals) {
    if (signal.status !== 'fail') continue;
    const kind = signal.name === 'aiSpend' ? ('AI_SPEND_CAP_EXCEEDED' as const) : ('OPS_HEALTH_DEGRADED' as const);
    alertsFired.push(`${kind}:${signal.name}`);
    await alerts
      .fire({
        kind,
        message: `${signal.name} is failing: value=${signal.value ?? 'unreadable'} (${signal.detail})`,
        context: { signal: signal.name, value: String(signal.value ?? 'null') },
      })
      .catch(() => {}); // fire() is documented never-throw; belt and suspenders
  }

  return { status: snapshot.status, alertsFired };
}

/** Parse a persisted snapshot; null for absent/corrupt (callers treat as "no data"). */
export function parseOpsHealthSnapshot(raw: string | null | undefined): OpsHealthSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OpsHealthSnapshot;
    if (!parsed || !Array.isArray(parsed.signals) || typeof parsed.status !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

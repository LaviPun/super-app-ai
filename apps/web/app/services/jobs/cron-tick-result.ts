import type { LoyaltyExpiryResult } from '~/services/jobs/loyalty-expiry.job';
import type { MetaobjectCleanupDrainResult } from '~/services/jobs/shopify-metaobject-cleanup.job';
import type { StuckSweepResult } from '~/services/jobs/stuck-job-sweep.server';
import type { OpsHealthSweepResult } from '~/services/observability/ops-health.server';

/**
 * The result of one cron tick — exactly the JSON body `/api/cron` has always
 * returned, so external callers (the GitHub Actions fallback, a curl by hand)
 * see no change; the worker scheduler summarises it via `summarizeCronTick`.
 *
 * Pure types + one pure function only: this module must stay importable
 * without dragging in the sweep graph (tests inject the tick function).
 */
export interface CronTickResult {
  ran: number;
  results: Array<{ scheduleId: string; shopDomain: string; ok: boolean; error?: string }>;
  resumeSweep: Array<{ runId: string; tenantId: string; status: string; error?: string }>;
  httpSyncReplay: Array<{ id: string; moduleId: string; ok: boolean }>;
  uninstallCleanup: MetaobjectCleanupDrainResult | null;
  auditRetention: { deleted: number; retentionDays: number; cutoff: string } | null;
  chatRetention: { deleted: number; retentionDays: number; cutoff: string } | null;
  loyaltyExpiry: LoyaltyExpiryResult | null;
  planSyncSweep: { synced: number; failed: number } | null;
  stuckJobSweep: StuckSweepResult | null;
  opsHealthSweep: OpsHealthSweepResult | null;
}

/** Flat per-sweep counts for one log line / one ActivityLog row. */
export interface CronTickSummary {
  schedulesRan: number;
  scheduleFailures: number;
  workflowsResumed: number;
  httpSyncReplayed: number;
  uninstallCleanupProcessed: number;
  auditRowsDeleted: number | null;
  chatRowsDeleted: number | null;
  loyaltyRowsExpired: number | null;
  planSynced: number | null;
  planSyncFailed: number | null;
  stuckJobsSwept: number | null;
  /** 'ok' | 'warn' | 'fail', or 'sweep-failed' when the ops-health sweep itself threw (heartbeat NOT written). */
  opsHealth: string;
  opsAlertsFired: number;
}

export function summarizeCronTick(result: CronTickResult): CronTickSummary {
  return {
    schedulesRan: result.ran,
    scheduleFailures: result.results.filter((r) => !r.ok).length,
    workflowsResumed: result.resumeSweep.length,
    httpSyncReplayed: result.httpSyncReplay.length,
    uninstallCleanupProcessed: result.uninstallCleanup?.processed ?? 0,
    auditRowsDeleted: result.auditRetention?.deleted ?? null,
    chatRowsDeleted: result.chatRetention?.deleted ?? null,
    loyaltyRowsExpired: result.loyaltyExpiry?.rowsExpired ?? null,
    planSynced: result.planSyncSweep?.synced ?? null,
    planSyncFailed: result.planSyncSweep?.failed ?? null,
    stuckJobsSwept: result.stuckJobSweep?.swept ?? null,
    opsHealth: result.opsHealthSweep?.status ?? 'sweep-failed',
    opsAlertsFired: result.opsHealthSweep?.alertsFired.length ?? 0,
  };
}

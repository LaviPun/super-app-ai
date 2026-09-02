/**
 * One cron tick — the scheduled-sweep body shared by:
 *   - the worker's in-process scheduler (`cron-scheduler.server.ts`, the
 *     primary trigger since 2026-09; every CRON_TICK_INTERVAL_MINUTES), and
 *   - the `/api/cron` HTTP route (manual / external trigger; the GitHub
 *     Actions `cron.yml` fallback still calls it).
 *
 * Extracted verbatim from `routes/api.cron.tsx` (auth/rate-limit stay in the
 * route). Every sweep keeps its own try/catch (C6/D8): one failing sweep is
 * logged loudly and never aborts the rest of the tick. The ops-health sweep
 * is what writes the `AppSettings.cronLastTickAt` heartbeat `/healthz/deep`
 * measures — deliberately LAST, so a tick that hangs or dies part-way leaves
 * the heartbeat stale and the staleness signal fires (a heartbeat written
 * up-front would hide exactly that failure).
 */
import { ScheduleService } from '~/services/flows/schedule.service';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { MessagingRunnerService } from '~/services/messaging/messaging-runner.service';
import { HttpSyncRunnerService } from '~/services/integration/http-sync-runner.service';
import { WorkflowEngineService } from '~/services/workflows/workflow-engine.service';
import { PlanSyncService } from '~/services/billing/plan-sync.service';
import { buildShopAuthResolver } from '~/services/flows/auth-resolver.server';
import { runInternalAiAuditRetention } from '~/services/jobs/internal-ai-audit-retention.job';
import { runInternalAiChatRetention } from '~/services/jobs/internal-ai-chat-retention.job';
import { runLoyaltyExpirySweep } from '~/services/jobs/loyalty-expiry.job';
import { drainShopifyMetaobjectCleanupJobs } from '~/services/jobs/shopify-metaobject-cleanup.job';
import { sweepStuckRunningJobs } from '~/services/jobs/stuck-job-sweep.server';
import { runOpsHealthSweep } from '~/services/observability/ops-health.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import type { AdminApiContext } from '~/types/shopify';
import type { CronTickResult } from './cron-tick-result';

export type { CronTickResult } from './cron-tick-result';
export { summarizeCronTick, type CronTickSummary } from './cron-tick-result';

let lastAuditRetentionRunAt: number | null = null;
let lastLoyaltyExpiryRunAt: number | null = null;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function runCronTick(): Promise<CronTickResult> {
  const scheduleService = new ScheduleService();
  const runner = new FlowRunnerService();
  const messagingRunner = new MessagingRunnerService();
  const httpSyncRunner = new HttpSyncRunnerService();

  const due = await scheduleService.claimDue();

  const results: CronTickResult['results'] = [];

  for (const item of due) {
    let event: unknown = { kind: 'schedule', scheduleId: item.id };
    try {
      event = { ...JSON.parse(item.eventJson), kind: 'schedule', scheduleId: item.id };
    } catch { /* keep default */ }

    try {
      // FlowRunnerService requires an admin context for Shopify API calls.
      // For scheduled runs we pass a minimal stub — steps using Shopify APIs
      // will fail gracefully and get retried; purely connector/HTTP steps work fine.
      await runner.runForTrigger(item.shopDomain, null as unknown as AdminApiContext['admin'], 'SCHEDULED', event);
      results.push({ scheduleId: item.id, shopDomain: item.shopDomain, ok: true });
    } catch (err) {
      results.push({ scheduleId: item.id, shopDomain: item.shopDomain, ok: false, error: String(err) });
    }

    // R3.4 sibling: fan out SCHEDULED broadcast campaigns for this shop. Messaging
    // sends via app connectors (email/slack), so it works without an admin context.
    // Own try/catch (C6) so a messaging failure never fails the schedule tick.
    try {
      await messagingRunner.runForTrigger(
        item.shopDomain,
        null as unknown as AdminApiContext['admin'],
        'SCHEDULED',
        event,
      );
    } catch (err) {
      logger.warn('[cron-tick] scheduled messaging fan-out failed', {
        shopDomain: item.shopDomain,
        scheduleId: item.id,
        ...safeErrorMeta(err),
      });
    }

    // Sibling (build #7a): fan out SCHEDULED integration.httpSync modules for this shop.
    // Dispatch is a plain outbound connector call (no admin context needed). Own
    // try/catch so a sync failure never fails the schedule tick.
    try {
      await httpSyncRunner.runForTrigger(
        item.shopDomain,
        null as unknown as AdminApiContext['admin'],
        'SCHEDULED',
        event,
      );
    } catch (err) {
      logger.warn('[cron-tick] scheduled httpSync fan-out failed', {
        shopDomain: item.shopDomain,
        scheduleId: item.id,
        ...safeErrorMeta(err),
      });
    }
  }

  // R3.5 durable scheduler: resume parked (WAITING) WorkflowRuns whose resumeAt is
  // due. Runs every tick alongside the absolute-cron schedule claim above; the CAS
  // claim inside resumeDueWorkflowRuns makes overlapping ticks idempotent. Own
  // try/catch (C6) so a sweep failure never fails the whole cron tick.
  let resumeSweep: CronTickResult['resumeSweep'] = [];
  try {
    resumeSweep = await new WorkflowEngineService().resumeDueWorkflowRuns({
      limit: 25,
      authResolverFor: (tenantId) => buildShopAuthResolver(tenantId),
    });
  } catch (err) {
    logger.warn('[cron-tick] workflow resume sweep failed', safeErrorMeta(err));
  }

  // integration.httpSync dead-letter replay (build #7a): re-dispatch failed outbound
  // syncs whose bounded backoff is due (DISCARDED after maxAttempts). Own try/catch (C6)
  // so a replay failure never fails the tick.
  let httpSyncReplay: CronTickResult['httpSyncReplay'] = [];
  try {
    httpSyncReplay = await new HttpSyncRunnerService().replayDueDeadLetters(20);
  } catch (err) {
    logger.warn('[cron-tick] httpSync dead-letter replay failed', safeErrorMeta(err));
  }

  // App Pricing has no subscription webhooks: reconcile plan state (cancels,
  // freezes, out-of-band changes) against the Partner API. Best-effort; own
  // try/catch so a sweep failure never fails the tick.
  let planSyncSweep: CronTickResult['planSyncSweep'] = null;
  try {
    const { synced, failed } = await new PlanSyncService().sweep();
    planSyncSweep = { synced, failed };
    if (synced || failed) logger.info('[cron-tick] plan-sync sweep', { synced, failed });
  } catch (err) {
    logger.warn('[cron-tick] plan-sync sweep failed', safeErrorMeta(err));
  }

  // Bounded drain of post-uninstall cleanup jobs queued by the app/uninstalled webhook.
  let uninstallCleanup: CronTickResult['uninstallCleanup'] = null;
  try {
    uninstallCleanup = await drainShopifyMetaobjectCleanupJobs();
  } catch (err) {
    logger.warn('[cron-tick] shopify-metaobject-cleanup drain failed', safeErrorMeta(err));
  }

  // WS-G Task 17: belt-and-suspenders reconciliation for Job rows stuck
  // RUNNING (a worker crash/stall the BullMQ 'failed'-event reconciler
  // never saw — see stuck-job-sweep.server.ts's doc comment). Own try/catch
  // so a sweep failure never fails the whole cron tick.
  let stuckJobSweep: CronTickResult['stuckJobSweep'] = null;
  try {
    stuckJobSweep = await sweepStuckRunningJobs();
  } catch (err) {
    logger.warn('[cron-tick] stuck-running job sweep failed', safeErrorMeta(err));
  }

  let auditRetention: CronTickResult['auditRetention'] = null;
  let chatRetention: CronTickResult['chatRetention'] = null;
  const now = Date.now();
  if (!lastAuditRetentionRunAt || now - lastAuditRetentionRunAt >= ONE_DAY_MS) {
    try {
      auditRetention = await runInternalAiAuditRetention();
      lastAuditRetentionRunAt = now;
    } catch (err) {
      auditRetention = { deleted: 0, retentionDays: 0, cutoff: new Date().toISOString() };
      logger.warn('[cron-tick] internal-ai-audit-retention failed', safeErrorMeta(err));
    }

    try {
      chatRetention = await runInternalAiChatRetention();
    } catch (err) {
      chatRetention = { deleted: 0, retentionDays: 0, cutoff: new Date().toISOString() };
      logger.warn('[cron-tick] internal-ai-chat-retention failed', safeErrorMeta(err));
    }
  }

  // R3.6 loyalty expiry: absolute nightly sweep that ages out due point lots across
  // shops with a loyalty-ledger composite. Daily cadence (idempotent, like the
  // retention jobs). Own try/catch so a sweep failure never fails the tick.
  let loyaltyExpiry: CronTickResult['loyaltyExpiry'] = null;
  if (!lastLoyaltyExpiryRunAt || now - lastLoyaltyExpiryRunAt >= ONE_DAY_MS) {
    try {
      loyaltyExpiry = await runLoyaltyExpirySweep({ now: new Date(now) });
      lastLoyaltyExpiryRunAt = now;
    } catch (err) {
      logger.warn('[cron-tick] loyalty-expiry sweep failed', safeErrorMeta(err));
    }
  }

  // DevOps hardening 2026-09: heartbeat + ops-health snapshot + threshold
  // alerts (DLQ depth, queue backlog, error spike, cron staleness, AI spend
  // cap). Runs every tick, LAST (see module doc) — the heartbeat it writes is
  // what the staleness signal measures. Own try/catch so a sweep failure never
  // fails the tick, but the failure is logged loudly (D8).
  let opsHealthSweep: CronTickResult['opsHealthSweep'] = null;
  try {
    opsHealthSweep = await runOpsHealthSweep();
  } catch (err) {
    logger.error('[cron-tick] ops-health sweep failed — heartbeat NOT written this tick', safeErrorMeta(err));
  }

  return {
    ran: results.length,
    results,
    resumeSweep,
    httpSyncReplay,
    uninstallCleanup,
    auditRetention,
    chatRetention,
    loyaltyExpiry,
    planSyncSweep,
    stuckJobSweep,
    opsHealthSweep,
  };
}

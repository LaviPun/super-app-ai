/**
 * Cron trigger endpoint — called periodically by an external scheduler
 * (e.g. Shopify Partner cron, GitHub Actions, Cloudflare Cron Triggers, or any HTTP cron service).
 *
 * Protection: requires `X-Cron-Secret` header matching CRON_SECRET env var.
 * If CRON_SECRET is not set, the endpoint is disabled.
 *
 * Fires all FlowSchedule records whose nextRunAt ≤ now.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from '@remix-run/node';
import { ScheduleService } from '~/services/flows/schedule.service';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { MessagingRunnerService } from '~/services/messaging/messaging-runner.service';
import { WorkflowEngineService } from '~/services/workflows/workflow-engine.service';
import { buildShopAuthResolver } from '~/services/flows/auth-resolver.server';
import { runInternalAiAuditRetention } from '~/services/jobs/internal-ai-audit-retention.job';
import { runInternalAiChatRetention } from '~/services/jobs/internal-ai-chat-retention.job';
import { runLoyaltyExpirySweep, type LoyaltyExpiryResult } from '~/services/jobs/loyalty-expiry.job';
import {
  drainShopifyMetaobjectCleanupJobs,
  type MetaobjectCleanupDrainResult,
} from '~/services/jobs/shopify-metaobject-cleanup.job';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { AppError } from '~/services/errors/app-error.server';
import type { AdminApiContext } from '~/types/shopify';

let lastAuditRetentionRunAt: number | null = null;
let lastLoyaltyExpiryRunAt: number | null = null;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  return 'unknown';
}

function constantTimeSecretMatch(provided: string, expected: string): boolean {
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(provided), hash(expected));
}

export async function loader({ request }: { request: Request }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }

  const clientIp = getClientIp(request);
  try {
    await enforceRateLimit(`cron:${clientIp}`);
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      const retryAfterSec = Number(err.details?.retryAfterSec ?? 60);
      return json({ error: err.message }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } });
    }
    throw err;
  }

  const provided = request.headers.get('x-cron-secret');
  if (!provided || !constantTimeSecretMatch(provided, secret)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scheduleService = new ScheduleService();
  const runner = new FlowRunnerService();
  const messagingRunner = new MessagingRunnerService();

  const due = await scheduleService.claimDue();

  const results: Array<{ scheduleId: string; shopDomain: string; ok: boolean; error?: string }> = [];

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
      logger.warn('[api.cron] scheduled messaging fan-out failed', {
        shopDomain: item.shopDomain,
        scheduleId: item.id,
        ...safeErrorMeta(err),
      });
    }
  }

  // R3.5 durable scheduler: resume parked (WAITING) WorkflowRuns whose resumeAt is
  // due. Runs every tick alongside the absolute-cron schedule claim above; the CAS
  // claim inside resumeDueWorkflowRuns makes overlapping ticks idempotent. Own
  // try/catch (C6) so a sweep failure never 500s the whole cron tick.
  let resumeSweep: Array<{ runId: string; tenantId: string; status: string; error?: string }> = [];
  try {
    resumeSweep = await new WorkflowEngineService().resumeDueWorkflowRuns({
      limit: 25,
      authResolverFor: (tenantId) => buildShopAuthResolver(tenantId),
    });
  } catch (err) {
    logger.warn('[api.cron] workflow resume sweep failed', safeErrorMeta(err));
  }

  // Bounded drain of post-uninstall cleanup jobs queued by the app/uninstalled webhook.
  let uninstallCleanup: MetaobjectCleanupDrainResult | null = null;
  try {
    uninstallCleanup = await drainShopifyMetaobjectCleanupJobs();
  } catch (err) {
    logger.warn('[api.cron] shopify-metaobject-cleanup drain failed', safeErrorMeta(err));
  }

  let auditRetention: { deleted: number; retentionDays: number; cutoff: string } | null = null;
  let chatRetention: { deleted: number; retentionDays: number; cutoff: string } | null = null;
  const now = Date.now();
  if (!lastAuditRetentionRunAt || now - lastAuditRetentionRunAt >= ONE_DAY_MS) {
    try {
      auditRetention = await runInternalAiAuditRetention();
      lastAuditRetentionRunAt = now;
    } catch (err) {
      auditRetention = { deleted: 0, retentionDays: 0, cutoff: new Date().toISOString() };
      logger.warn('[api.cron] internal-ai-audit-retention failed', safeErrorMeta(err));
    }

    try {
      chatRetention = await runInternalAiChatRetention();
    } catch (err) {
      chatRetention = { deleted: 0, retentionDays: 0, cutoff: new Date().toISOString() };
      logger.warn('[api.cron] internal-ai-chat-retention failed', safeErrorMeta(err));
    }
  }

  // R3.6 loyalty expiry: absolute nightly sweep that ages out due point lots across
  // shops with a loyalty-ledger composite. Daily cadence (idempotent, like the
  // retention jobs). Own try/catch so a sweep failure never 500s the tick.
  let loyaltyExpiry: LoyaltyExpiryResult | null = null;
  if (!lastLoyaltyExpiryRunAt || now - lastLoyaltyExpiryRunAt >= ONE_DAY_MS) {
    try {
      loyaltyExpiry = await runLoyaltyExpirySweep({ now: new Date(now) });
      lastLoyaltyExpiryRunAt = now;
    } catch (err) {
      logger.warn('[api.cron] loyalty-expiry sweep failed', safeErrorMeta(err));
    }
  }

  return json({ ran: results.length, results, resumeSweep, uninstallCleanup, auditRetention, chatRetention, loyaltyExpiry });
}

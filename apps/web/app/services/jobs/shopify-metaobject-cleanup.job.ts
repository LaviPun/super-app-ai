/**
 * Consumer for SHOPIFY_METAOBJECT_CLEANUP jobs queued by the app/uninstalled
 * webhook (routes/webhooks.tsx).
 *
 * By the time this runs the shop has uninstalled the app: its access tokens are
 * revoked and Shopify removes app-owned metaobjects/definitions itself, so no
 * Shopify-side API calls are possible (or needed). What DOES need cleaning is
 * local state that would otherwise keep acting for an uninstalled shop:
 *   - FlowSchedule rows stay active, so the cron keeps firing their flows
 *   - ModuleInstance rows keep claiming live storefront/checkout placements
 *   - leftover Session rows for the shop domain
 *
 * The drain is bounded (`limit` jobs per invocation, capped at 50) and each job
 * is claimed with an atomic QUEUED→RUNNING compare-and-swap so concurrent cron
 * ticks never double-process a job. Intended to be invoked from the cron loader
 * (api.cron.tsx).
 */
import { getPrisma } from '~/db.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

export const SHOPIFY_METAOBJECT_CLEANUP_JOB_TYPE = 'SHOPIFY_METAOBJECT_CLEANUP';

const DEFAULT_DRAIN_LIMIT = 10;
const MAX_DRAIN_LIMIT = 50;

export interface UninstallCleanupSummary {
  shopId: string | null;
  shopDomain: string | null;
  schedulesDeactivated: number;
  moduleInstancesDisabled: number;
  sessionsDeleted: number;
}

export interface MetaobjectCleanupDrainResult {
  processed: number;
  succeeded: number;
  failed: number;
  jobs: Array<{ jobId: string; shopId: string | null; ok: boolean; error?: string }>;
}

function parsePayloadShopDomain(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { shopDomain?: unknown };
    return typeof parsed.shopDomain === 'string' && parsed.shopDomain.trim()
      ? parsed.shopDomain.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

async function cleanupUninstalledShop(
  shopId: string | null,
  shopDomain: string | null,
): Promise<UninstallCleanupSummary> {
  const prisma = getPrisma();
  const summary: UninstallCleanupSummary = {
    shopId,
    shopDomain,
    schedulesDeactivated: 0,
    moduleInstancesDisabled: 0,
    sessionsDeleted: 0,
  };

  if (!shopId && !shopDomain) {
    throw new Error('SHOPIFY_METAOBJECT_CLEANUP job has neither shopId nor payload.shopDomain');
  }

  if (shopId) {
    const schedules = await prisma.flowSchedule.updateMany({
      where: { shopId, isActive: true },
      data: { isActive: false },
    });
    summary.schedulesDeactivated = schedules.count;

    const instances = await prisma.moduleInstance.updateMany({
      where: { shopId, enabled: true },
      data: { enabled: false },
    });
    summary.moduleInstancesDisabled = instances.count;
  }

  if (shopDomain) {
    // Defensive re-run of the webhook-time deletion; idempotent.
    const sessions = await prisma.session.deleteMany({ where: { shop: shopDomain } });
    summary.sessionsDeleted = sessions.count;
  }

  return summary;
}

/**
 * Drain up to `limit` queued SHOPIFY_METAOBJECT_CLEANUP jobs.
 * Each job ends in SUCCESS (with a JSON summary in `result`) or FAILED
 * (with the error message in `error`); failures never block the rest of the batch.
 */
export async function drainShopifyMetaobjectCleanupJobs(
  options: { limit?: number } = {},
): Promise<MetaobjectCleanupDrainResult> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_DRAIN_LIMIT, MAX_DRAIN_LIMIT));
  const prisma = getPrisma();

  const queued = await prisma.job.findMany({
    where: { type: SHOPIFY_METAOBJECT_CLEANUP_JOB_TYPE, status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  const result: MetaobjectCleanupDrainResult = { processed: 0, succeeded: 0, failed: 0, jobs: [] };

  for (const job of queued) {
    // Atomic claim — a concurrent drain loses the swap and skips the job.
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;

    result.processed += 1;
    try {
      const summary = await cleanupUninstalledShop(job.shopId, parsePayloadShopDomain(job.payload));
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'SUCCESS', finishedAt: new Date(), result: JSON.stringify(summary) },
      });
      result.succeeded += 1;
      result.jobs.push({ jobId: job.id, shopId: job.shopId, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.job
        .update({
          where: { id: job.id },
          data: { status: 'FAILED', finishedAt: new Date(), error: message },
        })
        .catch(() => {});
      logger.error('[shopify-metaobject-cleanup] job failed', {
        jobId: job.id,
        shopId: job.shopId ?? undefined,
        ...safeErrorMeta(err),
      });
      result.failed += 1;
      result.jobs.push({ jobId: job.id, shopId: job.shopId, ok: false, error: message });
    }
  }

  return result;
}

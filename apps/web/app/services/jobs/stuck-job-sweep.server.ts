import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { enqueueOwnedJob } from '~/services/jobs/ops-queue.server';
import { isOwnedJobType } from '~/services/jobs/job-executors.server';
import { OpsAlertService } from '~/services/observability/ops-alert.server';

const DEFAULT_STALE_AFTER_MS = 15 * 60_000; // 15 minutes with no finishedAt = stuck

export interface StuckSweepResult {
  swept: number;
  failedPermanently: number;
}

/**
 * WS-G Task 17. A Job RUNNING longer than staleAfterMs with no finishedAt is
 * either retried (attempts < maxAttempts, owned type → re-enqueued) or
 * FAILED permanently (attempts >= maxAttempts, or an unowned type — no safe
 * way to retry it).
 *
 * WS-C-consumption note: this is the complementary belt-and-suspenders sweep
 * to WS-C's BullMQ `'failed'`-event reconciler
 * (worker-runtime.server.ts's `reconcileFailedJobRow`, via
 * `JobService.failIfStillRunning`'s atomic single-writer discipline) — that
 * reconciler only fires when BullMQ actually emits a `'failed'` event for a
 * job it was tracking. This sweep is the cron-driven fallback for rows the
 * event path can miss entirely: a worker hard-crash (SIGKILL/OOM) before any
 * BullMQ event fires, or Redis data loss. It is NOT a duplicate of that event
 * handler — it never touches `PlatformJobType`/`PlatformQueueName` rows the
 * way the event handler does; it only reconciles rows created via this app's
 * own `JobService` bookkeeping (any JobType, platform or owned), using the
 * plain unconditional `JobService.fail` (this sweep's own `WHERE status:
 * 'RUNNING'` query IS its race-safety boundary, mirroring
 * `failIfStillRunning`'s discipline without needing that exact method).
 */
export async function sweepStuckRunningJobs(
  opts: { staleAfterMs?: number; limit?: number } = {},
): Promise<StuckSweepResult> {
  const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - staleAfterMs);
  const stuck = await prisma.job.findMany({
    where: { status: 'RUNNING', startedAt: { lte: cutoff } },
    take: opts.limit ?? 50,
  });

  let swept = 0;
  let failedPermanently = 0;
  const jobs = new JobService();
  for (const job of stuck) {
    if (isOwnedJobType(job.type) && job.attempts < job.maxAttempts) {
      let payload: unknown = null;
      if (job.payload) {
        try {
          payload = JSON.parse(job.payload);
        } catch {
          payload = job.payload;
        }
      }
      await enqueueOwnedJob({
        type: job.type,
        shopId: job.shopId ?? undefined,
        payload,
        correlationId: job.correlationId ?? undefined,
      });
      // The stuck row itself is superseded by the fresh enqueue — mark it
      // FAILED (not silently left RUNNING forever) so it drops out of
      // future sweeps.
      await jobs.fail(job.id, `Stuck in RUNNING > ${staleAfterMs}ms — re-enqueued as a new job`);
      swept += 1;
    } else {
      await jobs.fail(
        job.id,
        `Stuck in RUNNING > ${staleAfterMs}ms — ${
          isOwnedJobType(job.type) ? 'max attempts exhausted' : 'type not safely replayable'
        }`,
      );
      failedPermanently += 1;
    }
  }
  if (failedPermanently > 0) {
    await new OpsAlertService()
      .fire({
        kind: 'STUCK_JOB_SWEPT',
        message: `${failedPermanently} job(s) permanently failed by the stuck-RUNNING sweep`,
        context: { swept: String(swept), failedPermanently: String(failedPermanently) },
      })
      .catch(() => {});
  }
  return { swept, failedPermanently };
}

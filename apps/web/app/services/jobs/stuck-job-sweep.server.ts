import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { enqueueOwnedJob } from '~/services/jobs/ops-queue.server';
import { isOwnedJobType, type OwnedJobType } from '~/services/jobs/job-executors.server';
import { isAutoRetried } from '~/services/jobs/job-retry-policy';
import { OpsAlertService } from '~/services/observability/ops-alert.server';
import { logger } from '~/services/observability/logger.server';

const DEFAULT_STALE_AFTER_MS = 15 * 60_000; // 15 minutes with no finishedAt = stuck

export interface StuckSweepResult {
  swept: number;
  failedPermanently: number;
}

/**
 * WS-G Task 17. A Job RUNNING longer than staleAfterMs with no finishedAt is
 * either retried (owned + verified-idempotent type, attempts < maxAttempts →
 * re-enqueued) or FAILED permanently (a non-idempotent type, an unowned
 * type, or attempts exhausted — no safe way to retry it).
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
 * own `JobService` bookkeeping (any JobType, platform or owned).
 *
 * Fix round (Critical #2, controller ruling): the SELECT (`findMany`) and the
 * terminal write are NOT atomic — a job legitimately finishing (SUCCESS or a
 * normal FAILED) in the window between the two would previously be
 * overwritten by an unconditional `jobs.fail()`, and — worse — for a
 * "retry-eligible" row, a fresh duplicate job would be re-enqueued for work
 * that had already completed. The terminal write now goes through
 * `JobService.failIfStillRunning` (the SAME atomic `WHERE status: 'RUNNING'`
 * CAS worker-runtime.server.ts's reconciler uses) FIRST — a replacement job
 * is only ever enqueued once that CAS has durably claimed the stale row.
 * When the CAS loses (the row was no longer RUNNING — a legitimately
 * finishing job won the race), the sweep logs and moves on: no re-enqueue,
 * no ops alert, no double-write. (The previous version's doc comment claimed
 * the sweep's own query WAS its race-safety boundary — that was incorrect;
 * a SELECT and a later UPDATE are never atomic against each other on their
 * own.)
 *
 * Re-enqueue eligibility is now gated on `isAutoRetried` (job-retry-policy.ts
 * — the SAME per-kind idempotency policy Critical #1 introduced), not merely
 * `attempts < maxAttempts`: a non-idempotent owned type (e.g. CONNECTOR_TEST,
 * FLOW_RUN) that got stuck before ever starting (`attempts: 0`) would
 * otherwise still read as "under its own maxAttempts" and be wrongly
 * re-enqueued. A non-idempotent swept job is always FAILed permanently —
 * visible in the DLQ for a CONSCIOUS manual replay instead.
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
    const eligibleForRetry = isOwnedJobType(job.type) && isAutoRetried(job.type) && job.attempts < job.maxAttempts;

    if (eligibleForRetry) {
      const flipped = await jobs.failIfStillRunning(job.id, {
        error: 'INTERNAL_ERROR',
        message: `Stuck in RUNNING > ${staleAfterMs}ms — superseded by a re-enqueued replacement job`,
        requestId: job.id,
      });
      if (!flipped) {
        // CAS loss: the job finished (SUCCESS or its own FAILED) between the
        // select above and this write. It is no longer RUNNING — a
        // legitimate no-op, not an error. Never re-enqueue a duplicate for
        // work that already completed.
        logger.info('[stuck-job-sweep] skipped — job resolved between select and sweep (CAS loss)', {
          jobId: job.id,
          type: job.type,
        });
        continue;
      }
      let payload: unknown = null;
      if (job.payload) {
        try {
          payload = JSON.parse(job.payload);
        } catch {
          payload = job.payload;
        }
      }
      await enqueueOwnedJob({
        // eligibleForRetry already verified isOwnedJobType(job.type) above —
        // the type predicate doesn't survive being stored in a boolean.
        type: job.type as OwnedJobType,
        shopId: job.shopId ?? undefined,
        payload,
        correlationId: job.correlationId ?? undefined,
      });
      swept += 1;
      continue;
    }

    const flipped = await jobs.failIfStillRunning(job.id, {
      error: 'INTERNAL_ERROR',
      message: `Stuck in RUNNING > ${staleAfterMs}ms — ${
        !isOwnedJobType(job.type)
          ? 'type not safely replayable'
          : isAutoRetried(job.type)
            ? 'max attempts exhausted'
            : 'not auto-retried (no verified idempotency guard) — replay manually from the DLQ'
      }`,
      requestId: job.id,
    });
    if (flipped) {
      failedPermanently += 1;
    } else {
      // CAS loss: already terminal by the time we got here — no-op, not an error.
      logger.info('[stuck-job-sweep] skipped — job resolved between select and sweep (CAS loss)', {
        jobId: job.id,
        type: job.type,
      });
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

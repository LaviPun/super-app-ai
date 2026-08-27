import { Queue, Worker, type Job as BullJob } from 'bullmq';
import Redis from 'ioredis';
import { createRedisConnection, loadJobOrchestratorConfig, resolveEffectiveMode } from '@superapp/job-orchestration';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { JOB_EXECUTORS, isOwnedJobType, type OwnedJobType } from '~/services/jobs/job-executors.server';
import { retryAttemptsFor } from '~/services/jobs/job-retry-policy';
import { isTerminalWorkerFailure } from '~/services/jobs/worker-runtime.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

/**
 * WS-G Task 14 (Decision G8). A SEPARATE, web-local BullMQ queue for the job
 * kinds this app owns end-to-end (CONNECTOR_TEST/FLOW_RUN/MESSAGING_RUN/
 * HTTP_SYNC_RUN/RESTOCK_WATCH_RUN/LOYALTY_ACCRUAL_RUN — see job-executors.server.ts).
 *
 * WS-C-consumption note: this deliberately does NOT reuse
 * `createBullMqQueueAdapter`/`enqueueWebJob`/`createWebWorkerRuntime`
 * (enqueue.server.ts / worker-runtime.server.ts). Those are typed against
 * `@superapp/platform-contracts`'s `PlatformJobType`/`PlatformQueueName` — a
 * LOCKED cross-service contract shared with the Cloudflare side (see the
 * doc comment on `WebJobEnvelope` in worker-runtime.server.ts: "it is not
 * extended"). None of this plan's six owned job kinds are part of that
 * registry, so extending it would violate WS-C's contract. Instead this
 * queue talks to BullMQ directly (same library, same Redis, same
 * `loadJobOrchestratorConfig`/`resolveEffectiveMode` mode seam WS-C uses) —
 * fully additive, zero overlap with the platform queue registry.
 *
 * Fix round (Critical #1, #3, Minor #6): `createOpsWorkerRuntime` below
 * mirrors WS-C's `createWebWorkerRuntime` pattern (worker-runtime.server.ts)
 * for both attempt-aware terminal/non-terminal failure handling AND the
 * BullMQ `'failed'`-event reconciler — reusing `isTerminalWorkerFailure`
 * directly (it's pure and already exported standalone for exactly this) and
 * `JobService.failIfStillRunning`'s atomic single-writer CAS.
 */
const OPS_QUEUE_NAME = 'superapp-ops';

let _queue: Queue | null = null;

function opsQueue(): Queue {
  if (_queue) return _queue;
  const config = loadJobOrchestratorConfig();
  const connection = createRedisConnection(config);
  _queue = new Queue(OPS_QUEUE_NAME, {
    connection,
    prefix: config.queuePrefix,
    defaultJobOptions: {
      backoff: { type: 'exponential', delay: config.defaultBackoffMs },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
  return _queue;
}

export { OPS_QUEUE_NAME };

/**
 * Creates the Job row (bookkeeping, unchanged contract) AND, when queue mode
 * is reachable, enqueues it onto the real BullMQ "superapp-ops" queue for
 * scripts/worker.ts's Worker to consume. Falls back to inline execution
 * (calling the executor directly) when queue mode isn't configured — same
 * "inline vs queue" seam `@superapp/job-orchestration` already models
 * elsewhere, so dev machines without Redis keep working.
 *
 * `attempts` is per-kind (job-retry-policy.ts, fix round Critical #1) — only
 * verified-idempotent kinds get BullMQ's automatic retry; everything else
 * gets exactly one attempt (a transient failure lands in the DLQ for a
 * conscious manual replay instead of silently re-running a side effect).
 * `Job.maxAttempts` is set to the SAME value so the stuck-RUNNING sweep and
 * the ops worker's final-attempt detection agree with BullMQ's real
 * behavior for this kind.
 */
export async function enqueueOwnedJob(input: {
  type: OwnedJobType;
  shopId?: string;
  payload: unknown;
  correlationId?: string;
}): Promise<{ jobId: string; queued: boolean }> {
  const attempts = retryAttemptsFor(input.type);
  const jobs = new JobService();
  const job = await jobs.create({
    shopId: input.shopId,
    type: input.type,
    payload: input.payload,
    correlationId: input.correlationId,
    maxAttempts: attempts,
  });

  const config = loadJobOrchestratorConfig();
  const mode = resolveEffectiveMode(config);
  if (mode !== 'queue') {
    // Inline fallback — execute now, still going through the same executor +
    // succeed/fail bookkeeping so behavior is identical to the queued path.
    // No BullMQ attempt context: an inline failure is always final (there is
    // no retry mechanism at all outside queue mode).
    await processOwnedJob({ id: job.id, type: job.type, payload: job.payload, shopId: job.shopId ?? undefined });
    return { jobId: job.id, queued: false };
  }

  await opsQueue().add(input.type, { jobId: job.id }, { jobId: job.id, attempts });
  return { jobId: job.id, queued: true };
}

/** BullMQ attempt context, mirroring WS-C's `WebJobEnvelope.attemptsMade`/`attemptsTotal`. */
export type OwnedJobAttemptInfo = {
  /** `job.attemptsMade` as seen while THIS attempt is running (0 on the first attempt). */
  attemptsMade: number;
  /** `job.opts.attempts` — the max attempts configured for this job. */
  attemptsTotal?: number;
};

/**
 * True when a failure on THIS attempt is terminal — no BullMQ retry coming.
 * Undefined attemptInfo (the inline-fallback path, no BullMQ context at all)
 * is always terminal. Unknown attemptsTotal reads as terminal too (fail-safe,
 * same discipline WS-C's `isFinalAttempt` uses) — never leave a processor
 * unable to ever write a terminal FAILED because attempt info couldn't be
 * resolved.
 */
export function isFinalOwnedJobAttempt(info?: OwnedJobAttemptInfo): boolean {
  if (!info) return true;
  if (info.attemptsTotal == null) return true;
  return info.attemptsMade + 1 >= info.attemptsTotal;
}

/**
 * The worker processor: given a Job row (already fetched), runs its
 * executor and persists the outcome. Exported standalone so both
 * scripts/worker.ts (BullMQ Worker) and the inline fallback above call the
 * identical code path.
 *
 * Fix round (Critical #1, Minor #6): a FINAL-attempt failure writes terminal
 * FAILED via `JobService.fail` (which fires the JOB_FAILED ops alert, as
 * before). A NON-final attempt failure does NOT write FAILED and does NOT
 * alert — it logs a warning and RETHROWS so BullMQ actually retries (mirrors
 * WS-C's documented discipline: "a non-final attempt's failure should leave
 * the Job in a non-terminal state"). Before this fix, every failure was
 * unconditionally swallowed here, which meant configuring `attempts > 1` on
 * the queue had NO effect (the processor never signaled failure back to
 * BullMQ, so it never retried) — this is what makes the per-kind retry
 * policy (job-retry-policy.ts) a real, live behavior instead of a no-op.
 */
export async function processOwnedJob(
  job: { id: string; type: string; payload: string | null; shopId?: string },
  attemptInfo?: OwnedJobAttemptInfo,
): Promise<void> {
  const jobs = new JobService();
  if (!isOwnedJobType(job.type)) {
    await jobs.fail(job.id, new Error(`Job type ${job.type} is not in JOB_EXECUTORS (Decision G8) — cannot be processed by this worker`));
    return;
  }
  await jobs.start(job.id);
  try {
    let payload: unknown = null;
    if (job.payload) {
      try {
        payload = JSON.parse(job.payload);
      } catch {
        payload = job.payload;
      }
    }
    const result = await JOB_EXECUTORS[job.type](payload, { shopId: job.shopId });
    await jobs.succeed(job.id, result);
  } catch (err) {
    if (isFinalOwnedJobAttempt(attemptInfo)) {
      await jobs.fail(job.id, err);
      return;
    }
    logger.warn('[ops-queue] transient failure on a non-final attempt — leaving RUNNING for BullMQ retry, no ops alert', {
      jobId: job.id,
      type: job.type,
      attemptsMade: attemptInfo?.attemptsMade,
      attemptsTotal: attemptInfo?.attemptsTotal,
      ...safeErrorMeta(err),
    });
    throw err;
  }
}

/**
 * Fetches the job row by the BullMQ job's stored jobId and processes it —
 * the actual bullmq Worker processor callback, wired via
 * `createOpsWorkerRuntime` below.
 */
export async function processOwnedJobById(jobId: string, attemptInfo?: OwnedJobAttemptInfo): Promise<void> {
  const row = await getPrisma().job.findUnique({ where: { id: jobId } });
  if (!row) return; // job row gone (e.g. redacted shop) — nothing to do
  await processOwnedJob({ id: row.id, type: row.type, payload: row.payload, shopId: row.shopId ?? undefined }, attemptInfo);
}

/** Narrow slice of `JobService` this module depends on — a test seam, mirrors worker-runtime.server.ts. */
export type OpsWorkerJobReconciler = { failIfStillRunning: JobService['failIfStillRunning'] };

export type OpsWorkerRuntimeOptions = {
  connection?: Redis;
  concurrency?: number;
  /** Test seam / DI — defaults to a real `JobService`. */
  jobReconciler?: OpsWorkerJobReconciler;
};

export type OpsWorkerRuntime = { worker: Worker; close(): Promise<void> };

/**
 * Fix round (Important #3): mounts the "superapp-ops" BullMQ Worker with a
 * `'failed'`-event reconciler mirroring WS-C's `createWebWorkerRuntime`
 * (worker-runtime.server.ts) — same terminal-failure detection
 * (`isTerminalWorkerFailure`, reused directly rather than reimplemented) and
 * the same atomic `failIfStillRunning` CAS sync, for the exact same reason:
 * a worker hard-crash (SIGKILL/OOM) or a stall BullMQ gives up on never runs
 * `processOwnedJob`'s own `jobs.fail` path, so without this the row is left
 * RUNNING forever. Idempotent: `failIfStillRunning`'s `WHERE status:
 * 'RUNNING'` guard makes a duplicate/racing reconcile call a safe no-op.
 */
export function createOpsWorkerRuntime(options: OpsWorkerRuntimeOptions = {}): OpsWorkerRuntime {
  const config = loadJobOrchestratorConfig();
  const connection = options.connection ?? createRedisConnection(config);
  const jobReconciler = options.jobReconciler ?? new JobService();

  const worker = new Worker(
    OPS_QUEUE_NAME,
    async (bullJob: BullJob) => {
      const jobId = (bullJob.data as { jobId: string }).jobId;
      await processOwnedJobById(jobId, {
        attemptsMade: bullJob.attemptsMade ?? 0,
        attemptsTotal: bullJob.opts?.attempts,
      });
    },
    {
      connection,
      prefix: config.queuePrefix,
      concurrency: options.concurrency ?? 5,
    },
  );

  worker.on('error', (err) => logger.error('[ops-queue] bullmq worker error', safeErrorMeta(err)));

  worker.on('failed', (bullJob, err) => {
    void reconcileFailedOpsJobRow(jobReconciler, bullJob, err).catch((reconcileErr) => {
      logger.error('[ops-queue] ops-worker Job-row reconciliation itself threw', {
        jobId: bullJob?.id,
        ...safeErrorMeta(reconcileErr),
      });
    });
  });

  return {
    worker,
    async close() {
      await worker.close();
      if (!options.connection) await connection.quit();
    },
  };
}

/** Same shape/logic as worker-runtime.server.ts's `reconcileFailedJobRow` — see that doc for the full rationale. */
async function reconcileFailedOpsJobRow(
  jobReconciler: OpsWorkerJobReconciler,
  bullJob: BullJob | undefined,
  err: Error,
): Promise<void> {
  if (!bullJob?.id) {
    logger.error('[ops-queue] "failed" event fired with no job id — cannot reconcile a stuck Job row', safeErrorMeta(err));
    return;
  }
  const attemptsMade = bullJob.attemptsMade ?? 0;
  const attemptsTotal = bullJob.opts?.attempts;
  if (!isTerminalWorkerFailure(attemptsMade, attemptsTotal, err?.message)) {
    // A mid-retry attempt failure (the deliberate rethrow in processOwnedJob
    // above) — BullMQ will re-run this job; leave the row RUNNING.
    return;
  }
  // bullJob.id IS the Prisma Job.id — enqueueOwnedJob adds with
  // opts.jobId: job.id (and mirrors it into data.jobId for the processor).
  const flipped = await jobReconciler.failIfStillRunning(bullJob.id, {
    error: 'INTERNAL_ERROR',
    message:
      /stalled more than allowable limit/i.test(err?.message ?? '')
        ? 'The background worker stalled and BullMQ gave up retrying — the job did not complete.'
        : `The background worker crashed or was terminated before this job could finish: ${err?.message ?? 'unknown error'}.`,
    requestId: bullJob.id,
  });
  if (flipped) {
    logger.error('[ops-queue] reconciled a Job row stuck RUNNING after a terminal BullMQ "failed" event', {
      jobId: bullJob.id,
      attemptsMade,
      attemptsTotal,
      ...safeErrorMeta(err),
    });
  }
  // flipped === false: the row was already terminal by the time we got here
  // (processOwnedJob's own jobs.fail path won the race) — a legitimate no-op.
}

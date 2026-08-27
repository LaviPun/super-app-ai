import { Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { loadJobOrchestratorConfig } from '@superapp/job-orchestration';
import {
  JobTraceSchema,
  type JobEnvelope,
  type PlatformJobType,
  type PlatformQueueName,
} from '@superapp/platform-contracts';
import { JobService } from './job.service';
import type { AppErrorPayload } from '~/services/errors/app-error.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

export type WebJobHandlerResult = { status: 'SUCCESS' | 'FAILED'; result?: unknown };

/**
 * WS-C commit-0 fold-in (b): `JobEnvelope` (from `@superapp/platform-contracts`)
 * is a locked cross-service contract shared with the Cloudflare side — it is
 * not extended. Attempt info is threaded onto a web-local superset instead,
 * so processors can tell a mid-retry failure apart from a terminal one
 * without touching the shared schema.
 */
export type WebJobEnvelope = JobEnvelope & {
  /**
   * BullMQ's `job.attemptsMade` as seen while THIS attempt is running. BullMQ
   * only increments it once an attempt finishes (see `Job#shouldRetryJob`),
   * so it reflects attempts BEFORE this one — 0 on the very first attempt.
   */
  attemptsMade: number;
  /** `job.opts.attempts` — the max attempts configured for this job (queue default or per-enqueue override), when resolvable. */
  attemptsTotal?: number;
  /**
   * True when a failure on THIS attempt is terminal — i.e. BullMQ will not
   * retry (mirrors `attemptsMade + 1 >= attemptsTotal`, BullMQ's own
   * `shouldRetryJob` check). Unknown attempts info is treated as final
   * (fail-safe): a processor must never leave a Job silently stuck
   * non-terminal because it couldn't tell whether a retry was coming.
   * Processors MUST gate any terminal `Job.status = FAILED` write on this
   * flag — a non-final attempt's failure should leave the Job in a
   * non-terminal state so the poll route never shows a retry-in-progress
   * job as done.
   */
  isFinalAttempt: boolean;
};

export type WebJobHandler = (envelope: WebJobEnvelope) => Promise<WebJobHandlerResult>;

/** Narrow slice of `JobService` this module depends on — a test seam, see `jobReconciler` below. */
export type WorkerRuntimeJobReconciler = {
  failIfStillRunning: (jobId: string, payload: AppErrorPayload) => Promise<boolean>;
};

export type WebWorkerRuntimeOptions = {
  handlers: Partial<Record<PlatformQueueName, WebJobHandler>>;
  connection?: Redis;
  concurrency?: Partial<Record<PlatformQueueName, number>>;
  /** Test seam / DI — defaults to a real `JobService`. */
  jobReconciler?: WorkerRuntimeJobReconciler;
};

export type WebWorkerRuntime = { workers: Worker[]; close(): Promise<void> };

/**
 * BullMQ's own message for a job it gave up retrying after it stalled
 * `maxStalledCount` times (default 1) — distinct from a normal processor
 * throw, and NOT reliably distinguishable via `attemptsMade`/`attemptsTotal`
 * (a stall-driven give-up can fire well before all attempts are consumed).
 * Matched literally rather than imported because BullMQ does not export this
 * string as a constant.
 */
const STALLED_GIVE_UP_MESSAGE_RE = /stalled more than allowable limit/i;

/**
 * WS-C final review (IMPORTANT-2a). True when a BullMQ `'failed'` event
 * means NO further retry is coming for this job — either every configured
 * attempt is spent, or BullMQ gave up on a job that stalled beyond
 * `maxStalledCount` (see `STALLED_GIVE_UP_MESSAGE_RE` above). Unknown
 * `attemptsTotal` reads as terminal (fail-safe), matching the same
 * fail-safe default `WebJobEnvelope.isFinalAttempt` uses above — never leave
 * a stuck row unreconciled because attempts info couldn't be resolved.
 * Exported standalone so this decision is unit-testable without a real
 * BullMQ `Job` instance.
 */
export function isTerminalWorkerFailure(
  attemptsMade: number,
  attemptsTotal: number | undefined,
  errorMessage: string | undefined,
): boolean {
  if (errorMessage && STALLED_GIVE_UP_MESSAGE_RE.test(errorMessage)) return true;
  if (attemptsTotal == null) return true;
  return attemptsMade >= attemptsTotal;
}

/**
 * WS-C final review (IMPORTANT-2a). Reconciles the Prisma `Job` row after a
 * BullMQ `'failed'` event that is terminal (no retry coming): a worker
 * hard-crash (SIGKILL/OOM) or an event-loop stall on the FINAL attempt never
 * runs the normal processor code path (`failWithPayload`), so without this
 * the row is left `RUNNING` forever — invisible to `/internal/funnel`,
 * spinning the merchant's poll indefinitely (see the matching
 * `pollJobUntilTerminal` wall-clock backstop in `utils/job-poll.ts`, the
 * other end of this same fix).
 *
 * `bullJob` can be `undefined` per BullMQ's own typing — "when an stalled
 * job reaches the stalled limit and it is deleted by the `removeOnFail`
 * option." Our jobs are enqueued with `removeOnFail: false`
 * (`bullmq-queue.ts`), so this should not happen in practice, but without an
 * id there is nothing to reconcile — log and return rather than guess.
 */
async function reconcileFailedJobRow(
  jobReconciler: WorkerRuntimeJobReconciler,
  bullJob: Job | undefined,
  err: Error,
): Promise<void> {
  if (!bullJob?.id) {
    logger.error('[worker-runtime] "failed" event fired with no job id — cannot reconcile a stuck Job row', {
      ...safeErrorMeta(err),
    });
    return;
  }
  const attemptsMade = bullJob.attemptsMade ?? 0;
  const attemptsTotal = bullJob.opts?.attempts;
  if (!isTerminalWorkerFailure(attemptsMade, attemptsTotal, err?.message)) {
    // A mid-retry attempt failure — BullMQ will re-run this job; leave the
    // row RUNNING (mirrors the "non-final attempt failed" discipline every
    // processor already follows on its own throw path).
    return;
  }

  const flipped = await jobReconciler.failIfStillRunning(bullJob.id, {
    error: 'INTERNAL_ERROR',
    message: STALLED_GIVE_UP_MESSAGE_RE.test(err?.message ?? '')
      ? 'The background worker stalled and BullMQ gave up retrying — the job did not complete.'
      : `The background worker crashed or was terminated before this job could finish: ${err?.message ?? 'unknown error'}.`,
    requestId: bullJob.id,
  });
  if (flipped) {
    logger.error('[worker-runtime] reconciled a Job row stuck RUNNING after a terminal BullMQ "failed" event', {
      jobId: bullJob.id,
      attemptsMade,
      attemptsTotal,
      ...safeErrorMeta(err),
    });
  }
  // flipped === false means the row was already terminal by the time we got
  // here (the processor's own path won the race) — a legitimate no-op, not
  // an error.
}

/**
 * WS-C port of the V2 `apps/workers/src/worker-runtime.ts` pattern (salvaged
 * before WS-I deletes the V2 apps, D2). One BullMQ Worker per registered queue.
 * Contract difference vs V2: the enqueue side (enqueue.server.ts) embeds the
 * JobTrace INSIDE the payload because `createBullMqQueueAdapter.enqueue` only
 * transmits `payload` — the envelope is rebuilt here from `payload.trace`.
 */
export function createWebWorkerRuntime(options: WebWorkerRuntimeOptions): WebWorkerRuntime {
  const config = loadJobOrchestratorConfig();
  if (!config.queueRedisUrl) {
    throw new Error('QUEUE_REDIS_URL or REDIS_URL is required to start BullMQ workers');
  }
  const connection =
    options.connection ?? new Redis(config.queueRedisUrl, { maxRetriesPerRequest: null });
  const jobReconciler = options.jobReconciler ?? new JobService();

  const queueNames = Object.keys(options.handlers) as PlatformQueueName[];
  const workers = queueNames.map((queueName) => {
    const handler = options.handlers[queueName];
    if (!handler) throw new Error(`No handler registered for queue ${queueName}`);

    const worker = new Worker(
      queueName,
      async (bullJob: Job) => {
        const data = (bullJob.data ?? {}) as Record<string, unknown>;
        const trace = JobTraceSchema.safeParse(data.trace);
        const attemptsMade = bullJob.attemptsMade ?? 0;
        const attemptsTotal = bullJob.opts?.attempts;
        const envelope: WebJobEnvelope = {
          id: bullJob.id ?? bullJob.name,
          queueName,
          jobType: bullJob.name as PlatformJobType,
          payload: bullJob.data,
          trace: trace.success ? trace.data : { correlationId: bullJob.id ?? 'unknown' },
          attemptsMade,
          attemptsTotal,
          // Fail-safe: unknown attempts info reads as final rather than
          // leaving a processor unable to ever write a terminal FAILED.
          isFinalAttempt: attemptsTotal == null ? true : attemptsMade + 1 >= attemptsTotal,
        };
        const result = await handler(envelope);
        if (result.status === 'FAILED') {
          const message =
            typeof result.result === 'object' && result.result && 'error' in result.result
              ? String((result.result as { error?: { message?: string } }).error?.message ?? 'Worker job failed')
              : 'Worker job failed';
          throw new Error(message);
        }
        return result.result;
      },
      {
        connection,
        prefix: config.queuePrefix,
        concurrency:
          options.concurrency?.[queueName] ??
          Number.parseInt(process.env.WORKER_CONCURRENCY ?? '3', 10),
      },
    );

    // WS-C final review (IMPORTANT-2a): reconcile a Job row left RUNNING by
    // a worker crash/stall — see reconcileFailedJobRow's doc above. Errors
    // from the reconciler itself must never crash the worker process; a
    // reconciliation failure just leaves the row RUNNING, the same stuck
    // state that already existed before this handler ran.
    worker.on('failed', (bullJob, err) => {
      void reconcileFailedJobRow(jobReconciler, bullJob, err).catch((reconcileErr) => {
        logger.error('[worker-runtime] Job-row reconciliation itself threw', {
          jobId: bullJob?.id,
          ...safeErrorMeta(reconcileErr),
        });
      });
    });

    return worker;
  });

  return {
    workers,
    async close() {
      // close() waits for in-flight jobs — Railway redeploys drain gracefully.
      await Promise.all(workers.map((worker) => worker.close()));
      if (!options.connection) await connection.quit();
    },
  };
}

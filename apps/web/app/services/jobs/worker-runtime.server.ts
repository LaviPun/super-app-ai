import { Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { loadJobOrchestratorConfig } from '@superapp/job-orchestration';
import {
  JobTraceSchema,
  type JobEnvelope,
  type PlatformJobType,
  type PlatformQueueName,
} from '@superapp/platform-contracts';

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

export type WebWorkerRuntimeOptions = {
  handlers: Partial<Record<PlatformQueueName, WebJobHandler>>;
  connection?: Redis;
  concurrency?: Partial<Record<PlatformQueueName, number>>;
};

export type WebWorkerRuntime = { workers: Worker[]; close(): Promise<void> };

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

  const queueNames = Object.keys(options.handlers) as PlatformQueueName[];
  const workers = queueNames.map((queueName) => {
    const handler = options.handlers[queueName];
    if (!handler) throw new Error(`No handler registered for queue ${queueName}`);

    return new Worker(
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

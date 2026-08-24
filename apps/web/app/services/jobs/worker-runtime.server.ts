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
export type WebJobHandler = (envelope: JobEnvelope) => Promise<WebJobHandlerResult>;

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
        const envelope: JobEnvelope = {
          id: bullJob.id ?? bullJob.name,
          queueName,
          jobType: bullJob.name as PlatformJobType,
          payload: bullJob.data,
          trace: trace.success ? trace.data : { correlationId: bullJob.id ?? 'unknown' },
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

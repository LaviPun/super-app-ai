import { Worker } from 'bullmq';
import Redis from 'ioredis';
import {
  ASSET_STORAGE_QUEUE,
  PLATFORM_QUEUES,
  type PlatformQueueName,
} from '@superapp/platform-contracts';
import { loadJobOrchestratorConfig } from '@superapp/job-orchestration';
import { createImageStorageProcessor } from './image-storage.js';
import { createScaffoldWorkerHandlers } from './handlers/worker-handlers.js';
import type { JobHandler } from '@superapp/job-orchestration';

export type WorkerRuntimeOptions = {
  queues?: PlatformQueueName[];
  connection?: Redis;
  handlers?: Partial<Record<PlatformQueueName, JobHandler>>;
};

export type WorkerRuntime = {
  workers: Worker[];
  close: () => Promise<void>;
};

export function createWorkerRuntime(options: WorkerRuntimeOptions = {}): WorkerRuntime {
  const config = loadJobOrchestratorConfig();
  if (!config.queueRedisUrl) {
    throw new Error('QUEUE_REDIS_URL or REDIS_URL is required to start BullMQ workers');
  }

  const connection =
    options.connection ??
    new Redis(config.queueRedisUrl, {
      maxRetriesPerRequest: null,
    });

  const handlers: Partial<Record<PlatformQueueName, JobHandler>> = {
    [ASSET_STORAGE_QUEUE]: async (job) => {
      const processor = createImageStorageProcessor();
      const result = await processor({
        id: job.id,
        queueName: job.queueName,
        payload: job.payload,
        trace: job.trace,
      });
      return {
        status: result.status,
        result: result.result,
        events: result.events,
      };
    },
    ...createScaffoldWorkerHandlers(),
    ...options.handlers,
  };

  const queueNames = options.queues ?? [...PLATFORM_QUEUES];
  const workers = queueNames.map((queueName) => {
    const handler = handlers[queueName];
    if (!handler) {
      throw new Error(`No handler registered for queue ${queueName}`);
    }

    return new Worker(
      queueName,
      async (bullJob) => {
        const result = await handler({
          id: bullJob.id ?? bullJob.name,
          queueName,
          jobType: bullJob.name as never,
          payload: bullJob.data,
          trace: {
            correlationId:
              typeof bullJob.data === 'object' &&
              bullJob.data &&
              'traceId' in bullJob.data &&
              typeof bullJob.data.traceId === 'string'
                ? bullJob.data.traceId
                : bullJob.id ?? 'unknown',
            shopId:
              typeof bullJob.data === 'object' &&
              bullJob.data &&
              'shopId' in bullJob.data &&
              typeof bullJob.data.shopId === 'string'
                ? bullJob.data.shopId
                : undefined,
          },
        });

        if (result.status === 'FAILED') {
          throw new Error(
            typeof result.result === 'object' && result.result && 'error' in result.result
              ? String((result.result as { error?: { message?: string } }).error?.message)
              : 'Worker job failed',
          );
        }

        return result.result;
      },
      {
        connection,
        prefix: config.queuePrefix,
        concurrency: Number.parseInt(process.env.WORKER_CONCURRENCY ?? '5', 10),
      },
    );
  });

  return {
    workers,
    async close() {
      await Promise.all(workers.map((worker) => worker.close()));
      if (!options.connection) {
        await connection.quit();
      }
    },
  };
}

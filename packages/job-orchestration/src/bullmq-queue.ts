import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { JobOrchestratorConfig } from './config.js';
import type { EnqueueJobInput, JobQueueAdapter } from './types.js';

export type BullMqQueueFactoryOptions = {
  config: JobOrchestratorConfig;
  connection?: Redis;
};

export function createRedisConnection(config: JobOrchestratorConfig): Redis {
  if (!config.queueRedisUrl) {
    throw new Error('QUEUE_REDIS_URL or REDIS_URL is required for queue mode');
  }

  return new Redis(config.queueRedisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}

export function createBullMqQueueAdapter(options: BullMqQueueFactoryOptions): JobQueueAdapter {
  const connection = options.connection ?? createRedisConnection(options.config);
  const queues = new Map<string, Queue>();

  const getQueue = (queueName: string) => {
    const existing = queues.get(queueName);
    if (existing) return existing;

    const queue = new Queue(queueName, {
      connection,
      prefix: options.config.queuePrefix,
      defaultJobOptions: {
        attempts: options.config.defaultAttempts,
        backoff: {
          type: 'exponential',
          delay: options.config.defaultBackoffMs,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    queues.set(queueName, queue);
    return queue;
  };

  return {
    async enqueue(input: EnqueueJobInput) {
      const queue = getQueue(input.queueName);
      await queue.add(input.jobType, input.payload, {
        jobId: input.id,
        removeOnComplete: true,
        removeOnFail: false,
      });
      return { queueName: input.queueName, jobId: input.id };
    },
    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      if (!options.connection) {
        await connection.quit();
      }
    },
  };
}

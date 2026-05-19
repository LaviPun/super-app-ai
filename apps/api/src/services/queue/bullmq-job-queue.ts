import { Queue } from 'bullmq';
import type { QueueName, WorkerEvent } from '@superapp/platform-contracts';
import type { ApiEnv } from '../../env.js';
import type { EnqueueTransportInput, JobQueue, QueueEnqueueResult, QueueMetadata } from './job-queue.js';

type QueueMap = Partial<Record<QueueName, Queue>>;

export class BullMqJobQueue implements JobQueue {
  private readonly queues: QueueMap = {};

  constructor(private readonly env: ApiEnv) {}

  async enqueue(input: EnqueueTransportInput): Promise<QueueEnqueueResult> {
    const queue = this.getQueue(input.record.queueName);
    const bullJob = await queue.add(input.record.type, {
      jobId: input.record.id,
      payload: input.request.payload,
      trace: input.request.trace,
      idempotencyKey: input.request.idempotencyKey,
    }, {
      jobId: input.record.id,
      attempts: this.env.QUEUE_DEFAULT_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: this.env.QUEUE_DEFAULT_BACKOFF_MS,
      },
      removeOnComplete: 1_000,
      removeOnFail: false,
    });

    return {
      transportJobId: String(bullJob.id),
      queueName: input.record.queueName,
    };
  }

  async publishEvent(event: WorkerEvent): Promise<void> {
    const queue = this.getQueue(event.queueName);
    await queue.add('worker-event', event, {
      jobId: `${event.jobId}:${event.type}:${event.timestamp}`,
      removeOnComplete: 1_000,
      removeOnFail: 1_000,
    });
  }

  async getStatus(jobId: string, queueName: QueueName): Promise<'queued' | 'running' | 'completed' | 'failed' | 'unknown'> {
    const job = await this.getQueue(queueName).getJob(jobId);
    if (!job) return 'unknown';
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'prioritized') return 'queued';
    if (state === 'active') return 'running';
    if (state === 'completed') return 'completed';
    if (state === 'failed') return 'failed';
    return 'unknown';
  }

  metadata(): QueueMetadata {
    return {
      provider: 'bullmq',
      queues: Object.keys(this.queues) as QueueName[],
    };
  }

  async close(): Promise<void> {
    await Promise.all(Object.values(this.queues).flatMap((queue) => (queue ? [queue.close()] : [])));
  }

  private getQueue(name: QueueName): Queue {
    const existing = this.queues[name];
    if (existing) return existing;
    if (!this.env.QUEUE_REDIS_URL) {
      throw new Error('QUEUE_REDIS_URL is required for BullMQ queue provider');
    }
    const queue = new Queue(name, {
      connection: { url: this.env.QUEUE_REDIS_URL },
      prefix: this.env.QUEUE_PREFIX,
    });
    this.queues[name] = queue;
    return queue;
  }
}

import type { EnqueueJobRequest, JobRecord, QueueName, WorkerEvent } from '@superapp/platform-contracts';

export type EnqueueTransportInput = {
  record: JobRecord;
  request: EnqueueJobRequest;
};

export type QueueEnqueueResult = {
  transportJobId: string;
  queueName: QueueName;
};

export type QueueMetadata = {
  provider: 'memory' | 'bullmq';
  queues: QueueName[];
};

export interface JobQueue {
  enqueue(input: EnqueueTransportInput): Promise<QueueEnqueueResult>;
  getStatus?(jobId: string, queueName: QueueName): Promise<'queued' | 'running' | 'completed' | 'failed' | 'unknown'>;
  publishEvent(event: WorkerEvent): Promise<void>;
  metadata(): QueueMetadata;
  close?(): Promise<void>;
}

export class InMemoryJobQueue implements JobQueue {
  readonly enqueued: EnqueueTransportInput[] = [];
  readonly events: WorkerEvent[] = [];

  async enqueue(input: EnqueueTransportInput): Promise<QueueEnqueueResult> {
    this.enqueued.push(input);
    return {
      transportJobId: input.record.id,
      queueName: input.record.queueName,
    };
  }

  async publishEvent(event: WorkerEvent): Promise<void> {
    this.events.push(event);
  }

  async getStatus(jobId: string, queueName: QueueName): Promise<'queued' | 'running' | 'completed' | 'failed' | 'unknown'> {
    const hit = this.enqueued.find((item) => item.record.id === jobId && item.record.queueName === queueName);
    return hit ? 'queued' : 'unknown';
  }

  metadata(): QueueMetadata {
    const queues = [...new Set(this.enqueued.map((item) => item.record.queueName))];
    return {
      provider: 'memory',
      queues,
    };
  }
}

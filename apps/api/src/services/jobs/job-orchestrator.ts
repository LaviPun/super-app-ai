import {
  EnqueueJobResponseSchema,
  JobPayloadByType,
  JobTypeQueueName,
  WorkerEventSchema,
  type EnqueueJobRequest,
  type EnqueueJobResponse,
} from '@superapp/platform-contracts';
import type { ApiEnv } from '../../env.js';
import type { JobStore } from './job-store.js';
import type { JobQueue } from '../queue/job-queue.js';

export type JobOrchestratorOptions = {
  env: ApiEnv;
  store: JobStore;
  queue: JobQueue;
};

export class JobOrchestrator {
  constructor(private readonly options: JobOrchestratorOptions) {}

  async enqueue(request: EnqueueJobRequest): Promise<EnqueueJobResponse> {
    if (this.options.env.JOB_EXECUTION_MODE === 'disabled') {
      throw Object.assign(new Error('Job execution is disabled'), {
        code: 'JOB_EXECUTION_DISABLED',
        statusCode: 503,
      });
    }

    const payloadResult = JobPayloadByType[request.type].safeParse(request.payload);
    if (!payloadResult.success) {
      throw Object.assign(new Error('Invalid job payload'), {
        code: 'INVALID_JOB_PAYLOAD',
        statusCode: 400,
        details: payloadResult.error.flatten(),
      });
    }

    const queueName = JobTypeQueueName[request.type];
    const { record, deduped } = await this.options.store.createQueued({ request, queueName });

    if (!deduped) {
      await this.options.queue.enqueue({ record, request });
      await this.options.queue.publishEvent(WorkerEventSchema.parse({
        type: 'JOB_QUEUED',
        jobId: record.id,
        queueName,
        trace: request.trace,
        timestamp: new Date().toISOString(),
        metadata: {
          executionMode: this.options.env.JOB_EXECUTION_MODE,
          queueProvider: this.options.env.QUEUE_PROVIDER,
        },
      }));
    }

    return EnqueueJobResponseSchema.parse({
      jobId: record.id,
      queueName,
      status: record.status,
      deduped,
    });
  }
}

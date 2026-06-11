import {
  JobOrchestratorConfigSchema,
  loadJobOrchestratorConfig,
  resolveEffectiveMode,
} from './config.js';
import { createBullMqQueueAdapter } from './bullmq-queue.js';
import { getJobStatusStore } from './job-status-store.js';
import type {
  EnqueueJobInput,
  EnqueueJobResult,
  JobHandler,
  JobQueueAdapter,
} from './types.js';
import {
  JobEnvelopeSchema,
  resolvePlatformQueue,
  type JobEnvelope,
  type PlatformJobType,
  type PlatformQueueName,
} from '@superapp/platform-contracts';

export type JobOrchestratorOptions = {
  inlineHandlers?: Partial<Record<PlatformQueueName, JobHandler>>;
  queueAdapter?: JobQueueAdapter;
  config?: ReturnType<typeof loadJobOrchestratorConfig>;
};

export class JobOrchestrator {
  private readonly config: ReturnType<typeof loadJobOrchestratorConfig>;
  private readonly effectiveMode: ReturnType<typeof resolveEffectiveMode>;
  private readonly inlineHandlers: Partial<Record<PlatformQueueName, JobHandler>>;
  private readonly queueAdapter?: JobQueueAdapter;
  private ownsQueueAdapter = false;

  constructor(options: JobOrchestratorOptions = {}) {
    this.config = JobOrchestratorConfigSchema.parse(
      options.config ?? loadJobOrchestratorConfig(),
    );
    this.effectiveMode = resolveEffectiveMode(this.config);
    this.inlineHandlers = options.inlineHandlers ?? {};

    if (options.queueAdapter) {
      this.queueAdapter = options.queueAdapter;
    } else if (this.effectiveMode === 'queue') {
      this.queueAdapter = createBullMqQueueAdapter({ config: this.config });
      this.ownsQueueAdapter = true;
    }
  }

  get executionMode() {
    return this.effectiveMode;
  }

  async enqueue(input: {
    id: string;
    jobType: PlatformJobType;
    payload: unknown;
    trace: JobEnvelope['trace'];
    queueName?: PlatformQueueName;
  }): Promise<EnqueueJobResult> {
    if (!this.config.platformV2Enabled) {
      await getJobStatusStore().upsert({
        jobId: input.id,
        jobType: input.jobType,
        queueName: input.queueName ?? resolvePlatformQueue(input.jobType),
        status: 'SKIPPED',
        correlationId: input.trace.correlationId,
        shopId: input.trace.shopId,
        updatedAt: new Date().toISOString(),
        error: { code: 'PLATFORM_V2_DISABLED', message: 'PLATFORM_V2_ENABLED is false' },
      });
      return { status: 'skipped', reason: 'PLATFORM_V2_ENABLED is false' };
    }

    if (this.effectiveMode === 'disabled') {
      return { status: 'skipped', reason: 'JOB_EXECUTION_MODE is disabled' };
    }

    const queueName = input.queueName ?? resolvePlatformQueue(input.jobType);
    const envelope = JobEnvelopeSchema.safeParse({
      id: input.id,
      queueName,
      jobType: input.jobType,
      payload: input.payload,
      trace: input.trace,
    });

    if (!envelope.success) {
      return { status: 'invalid', reason: 'Job envelope failed validation' };
    }

    await getJobStatusStore().upsert({
      jobId: input.id,
      jobType: input.jobType,
      queueName,
      status: 'QUEUED',
      correlationId: input.trace.correlationId,
      shopId: input.trace.shopId,
      updatedAt: new Date().toISOString(),
    });

    if (this.effectiveMode === 'inline') {
      const handler = this.inlineHandlers[queueName];
      if (!handler) {
        return {
          status: 'skipped',
          reason: `No inline handler registered for queue ${queueName}`,
        };
      }

      await getJobStatusStore().upsert({
        jobId: input.id,
        jobType: input.jobType,
        queueName,
        status: 'RUNNING',
        correlationId: input.trace.correlationId,
        shopId: input.trace.shopId,
        updatedAt: new Date().toISOString(),
      });

      const handlerResult = await handler(envelope.data);
      await getJobStatusStore().upsert({
        jobId: input.id,
        jobType: input.jobType,
        queueName,
        status: handlerResult.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        correlationId: input.trace.correlationId,
        shopId: input.trace.shopId,
        updatedAt: new Date().toISOString(),
        result: handlerResult.result,
        error:
          handlerResult.status === 'FAILED' &&
          typeof handlerResult.result === 'object' &&
          handlerResult.result &&
          'error' in handlerResult.result
            ? (handlerResult.result as { error: { code: string; message: string } }).error
            : undefined,
      });
      return {
        status: 'completed',
        queueName,
        jobId: input.id,
        handlerResult,
      };
    }

    if (!this.queueAdapter) {
      return { status: 'skipped', reason: 'Queue adapter is not configured' };
    }

    const queued = await this.queueAdapter.enqueue(envelope.data as EnqueueJobInput);
    return { status: 'queued', queueName: queued.queueName, jobId: queued.jobId };
  }

  async close(): Promise<void> {
    if (this.ownsQueueAdapter && this.queueAdapter) {
      await this.queueAdapter.close();
    }
  }
}

export function createJobOrchestrator(options: JobOrchestratorOptions = {}) {
  return new JobOrchestrator(options);
}

import {
  loadJobOrchestratorConfig,
  resolveEffectiveMode,
} from './config.js';
import { createBullMqQueueAdapter } from './bullmq-queue.js';
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
    this.config = options.config ?? loadJobOrchestratorConfig();
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

    if (this.effectiveMode === 'inline') {
      const handler = this.inlineHandlers[queueName];
      if (!handler) {
        return {
          status: 'skipped',
          reason: `No inline handler registered for queue ${queueName}`,
        };
      }

      const handlerResult = await handler(envelope.data);
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

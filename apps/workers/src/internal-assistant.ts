import { InternalToolRunPayloadSchema, type WorkerEvent } from '@superapp/platform-contracts';
import type { JobLedgerRepository } from '@superapp/db';
import type { WorkerLogger } from './logger.js';
import type { WorkerJobEnvelope, WorkerProcessorResult } from './processors.js';

export type InternalAssistantRunResult = {
  reply: string;
  target: 'localMachine' | 'modalRemote';
  backend: 'ollama' | 'openai' | 'qwen3' | 'custom' | 'test';
  model: string;
  tokensIn: number;
  tokensOut: number;
};

export interface InternalAssistantAdapter {
  run(input: {
    sessionId: string;
    message: string;
    target: 'localMachine' | 'modalRemote';
    clientRequestId?: string;
    retryCount: number;
    trace: WorkerJobEnvelope['trace'];
  }): Promise<InternalAssistantRunResult>;
}

export type InternalAssistantProcessorOptions = {
  adapter: InternalAssistantAdapter;
  jobRepository?: JobLedgerRepository;
  logger: WorkerLogger;
  localOnly?: boolean;
};

export class StubInternalAssistantAdapter implements InternalAssistantAdapter {
  async run(input: {
    sessionId: string;
    message: string;
    target: 'localMachine' | 'modalRemote';
  }): Promise<InternalAssistantRunResult> {
    return {
      reply: `Stub internal assistant response for ${input.sessionId}: ${input.message.slice(0, 80)}`,
      target: input.target,
      backend: 'test',
      model: 'stub-internal-assistant',
      tokensIn: input.message.length,
      tokensOut: 64,
    };
  }
}

export function createInternalAssistantProcessor(options: InternalAssistantProcessorOptions) {
  return async (job: WorkerJobEnvelope): Promise<WorkerProcessorResult> => {
    if (job.type !== 'INTERNAL_TOOL_RUN') {
      throw new Error(`Unsupported internal assistant job type: ${job.type}`);
    }
    const payload = InternalToolRunPayloadSchema.parse(job.payload);
    if (options.localOnly && payload.target === 'modalRemote') {
      throw new Error('INTERNAL_AI_LOCAL_ONLY blocks modalRemote assistant jobs');
    }

    await options.jobRepository?.update(job.id, {
      status: 'RUNNING',
      attempts: 1,
      startedAt: new Date().toISOString(),
    });

    const started = event(job, 'JOB_STARTED', 5, 'Internal assistant run started');
    try {
      const result = await options.adapter.run({
        sessionId: payload.sessionId,
        message: payload.message,
        target: payload.target,
        clientRequestId: payload.clientRequestId,
        retryCount: payload.retryCount ?? 0,
        trace: job.trace,
      });
      await options.jobRepository?.update(job.id, {
        status: 'SUCCESS',
        result,
        finishedAt: new Date().toISOString(),
      });
      options.logger.info('internal assistant job completed', {
        jobId: job.id,
        sessionId: payload.sessionId,
        target: result.target,
      });
      return {
        status: 'SUCCESS',
        events: [
          started,
          event(job, 'JOB_PROGRESS', 80, 'Internal assistant adapter completed'),
          event(job, 'JOB_COMPLETED', 100, 'Internal assistant run completed', result),
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await options.jobRepository?.update(job.id, {
        status: 'FAILED',
        error: message,
        finishedAt: new Date().toISOString(),
      });
      options.logger.error('internal assistant job failed', {
        jobId: job.id,
        sessionId: payload.sessionId,
        message,
      });
      throw err;
    }
  };
}

function event(
  job: WorkerJobEnvelope,
  type: WorkerEvent['type'],
  progress: number,
  message: string,
  metadata?: Record<string, unknown>,
): WorkerEvent {
  return {
    type,
    jobId: job.id,
    queueName: job.queueName,
    trace: job.trace,
    timestamp: new Date().toISOString(),
    progress,
    message,
    metadata,
  };
}

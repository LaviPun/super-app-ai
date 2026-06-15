import { RecipeSpecSchema } from '@superapp/core';
import {
  AiGeneratePayloadSchema,
  AiHydratePayloadSchema,
  AiModifyPayloadSchema,
  type JobType,
  type WorkerEvent,
} from '@superapp/platform-contracts';
import type { JobLedgerRepository } from '@superapp/db';
import type { WorkerJobEnvelope, WorkerProcessorResult } from './processors.js';
import type { WorkerLogger } from './logger.js';

export type AiWorkerAction = 'GENERATE' | 'HYDRATE' | 'MODIFY';

export type AiWorkerResult = {
  recipeSpec?: unknown;
  options?: unknown[];
  validationReport?: unknown;
  hydratedAt?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
};

export interface AiGenerationAdapter {
  generate(input: {
    prompt: string;
    moduleTypeHint?: string;
    catalogId?: string;
    trace: WorkerJobEnvelope['trace'];
  }): Promise<AiWorkerResult>;
  hydrate(input: {
    moduleId: string;
    sourceSpec?: Record<string, unknown>;
    trace: WorkerJobEnvelope['trace'];
  }): Promise<AiWorkerResult>;
  modify(input: {
    moduleId: string;
    instruction: string;
    trace: WorkerJobEnvelope['trace'];
  }): Promise<AiWorkerResult>;
}

export type AiGenerationHandlerOptions = {
  adapter: AiGenerationAdapter;
  jobRepository?: JobLedgerRepository;
  logger: WorkerLogger;
};

export class StubAiGenerationAdapter implements AiGenerationAdapter {
  async generate(input: { prompt: string }): Promise<AiWorkerResult> {
    return {
      recipeSpec: {
        type: 'theme.section',
        name: 'Generated banner',
        category: 'STOREFRONT_UI',
        requires: ['THEME_ASSETS'],
        config: {
          kind: 'banner',
          activation: 'section',
          title: input.prompt.slice(0, 60) || 'Store announcement',
          subtitle: 'Generated safely as RecipeSpec JSON.',
          fields: { ctaText: 'Shop now', ctaUrl: 'https://example.com/collections/all' },
          blocks: [],
        },
      },
      options: [],
      model: 'stub-ai-worker',
      tokensIn: input.prompt.length,
      tokensOut: 128,
    };
  }

  async hydrate(input: { moduleId: string; sourceSpec?: Record<string, unknown> }): Promise<AiWorkerResult> {
    return {
      recipeSpec: input.sourceSpec,
      validationReport: { overall: 'PASS', checks: [] },
      hydratedAt: new Date().toISOString(),
      model: 'stub-ai-worker',
    };
  }

  async modify(input: { moduleId: string; instruction: string }): Promise<AiWorkerResult> {
    return {
      recipeSpec: {
        type: 'theme.section',
        name: `Modified ${input.moduleId}`,
        category: 'STOREFRONT_UI',
        requires: ['THEME_ASSETS'],
        config: {
          kind: 'banner',
          activation: 'section',
          title: input.instruction.slice(0, 60) || 'Updated announcement',
          subtitle: 'Modified safely as RecipeSpec JSON.',
          fields: { ctaText: 'Learn more', ctaUrl: 'https://example.com/collections/all' },
          blocks: [],
        },
      },
      model: 'stub-ai-worker',
      tokensIn: input.instruction.length,
      tokensOut: 96,
    };
  }
}

export function createAiGenerationProcessor(options: AiGenerationHandlerOptions) {
  return async (job: WorkerJobEnvelope): Promise<WorkerProcessorResult> => {
    if (!isAiJobType(job.type)) {
      throw new Error(`Unsupported AI worker job type: ${job.type}`);
    }

    await options.jobRepository?.update(job.id, {
      status: 'RUNNING',
      attempts: 1,
      startedAt: new Date().toISOString(),
    });

    const started = event(job, 'JOB_STARTED', 5, `${job.type} started`);
    try {
      const result = await runAiJob(job, options.adapter);
      validateRecipeBoundary(job.type, result);
      await options.jobRepository?.update(job.id, {
        status: 'SUCCESS',
        result: result as Record<string, unknown>,
        finishedAt: new Date().toISOString(),
      });
      options.logger.info('AI worker job completed', {
        jobId: job.id,
        type: job.type,
        correlationId: job.trace.correlationId,
      });
      return {
        status: 'SUCCESS',
        events: [
          started,
          event(job, 'JOB_PROGRESS', 80, `${job.type} validated RecipeSpec boundary`),
          event(job, 'JOB_COMPLETED', 100, `${job.type} completed`, result as Record<string, unknown>),
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await options.jobRepository?.update(job.id, {
        status: 'FAILED',
        error: message,
        finishedAt: new Date().toISOString(),
      });
      options.logger.error('AI worker job failed', {
        jobId: job.id,
        type: job.type,
        correlationId: job.trace.correlationId,
        message,
      });
      throw err;
    }
  };
}

function isAiJobType(type: JobType): type is 'AI_GENERATE' | 'AI_HYDRATE' | 'AI_MODIFY' {
  return type === 'AI_GENERATE' || type === 'AI_HYDRATE' || type === 'AI_MODIFY';
}

async function runAiJob(job: WorkerJobEnvelope, adapter: AiGenerationAdapter): Promise<AiWorkerResult> {
  if (job.type === 'AI_GENERATE') {
    const payload = AiGeneratePayloadSchema.parse(job.payload);
    return adapter.generate({ ...payload, trace: job.trace });
  }
  if (job.type === 'AI_HYDRATE') {
    const payload = AiHydratePayloadSchema.parse(job.payload);
    return adapter.hydrate({ ...payload, trace: job.trace });
  }
  const payload = AiModifyPayloadSchema.parse(job.payload);
  return adapter.modify({ ...payload, trace: job.trace });
}

function validateRecipeBoundary(type: JobType, result: AiWorkerResult): void {
  if (type === 'AI_HYDRATE') return;
  if (!result.recipeSpec) {
    throw new Error(`${type} must return RecipeSpec JSON`);
  }
  RecipeSpecSchema.parse(result.recipeSpec);
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

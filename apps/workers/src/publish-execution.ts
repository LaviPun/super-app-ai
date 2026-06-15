import { PublishPayloadSchema, type WorkerEvent } from '@superapp/platform-contracts';
import {
  runPublishJob,
  type PublishJobPayload,
  type PublishWorkerAdapters,
  type PublishWorkerState,
  type RecipeSpec,
} from '@superapp/core';
import type { WorkerJobEnvelope, WorkerProcessorResult } from './processors.js';
import type { WorkerLogger } from './logger.js';

const STUB_SPEC: RecipeSpec = {
  type: 'theme.section',
  name: 'Queue publish stub',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: {
    kind: 'custom',
    activation: 'section',
    title: 'Configured via RecipeSpec',
    fields: {},
    blocks: [],
  },
};

export type PublishExecutionAdapter = PublishWorkerAdapters;

export function createStubPublishExecutionAdapter(): PublishExecutionAdapter {
  let state: PublishWorkerState = {
    moduleStatus: 'DRAFT',
    versionStatus: 'DRAFT',
    activeVersionId: null,
  };

  return {
    compiler: {
      compile(spec) {
        return {
          operations: [
            {
              kind: 'THEME_MODULE_UPSERT',
              moduleId: 'stub-module',
              payload: { type: spec.type, name: spec.name, config: spec.config ?? {} },
            },
          ],
          compiledJson: JSON.stringify({ stub: true, type: spec.type }),
        };
      },
    },
    shopify: {
      async apply() {
        return;
      },
    },
    state: {
      async getCurrent() {
        return state;
      },
      async markAttempt() {
        state = { ...state, moduleStatus: 'PUBLISHING', versionStatus: 'PUBLISHING' };
      },
      async markSucceeded() {
        state = {
          moduleStatus: 'PUBLISHED',
          versionStatus: 'PUBLISHED',
          activeVersionId: 'ver-stub',
        };
      },
      async markFailed() {
        state = { ...state, moduleStatus: 'FAILED', versionStatus: 'FAILED' };
      },
      async markIdempotent() {
        return;
      },
    },
  };
}

function toPublishJobPayload(job: WorkerJobEnvelope, parsed: { moduleId: string; versionId?: string }): PublishJobPayload {
  const versionId = parsed.versionId ?? `${parsed.moduleId}-draft`;
  const shopDomain = job.trace.shopId ? `${job.trace.shopId}.myshopify.com` : 'stub.myshopify.com';
  return {
    jobId: job.id,
    shopId: job.trace.shopId,
    shopDomain,
    moduleId: parsed.moduleId,
    versionId,
    idempotencyKey: `publish:${shopDomain}:${parsed.moduleId}:${versionId}:stub`,
    source: 'system',
    target: { kind: 'THEME', themeId: '1', moduleId: parsed.moduleId },
    spec: STUB_SPEC,
  };
}

function publishEventsFromResult(
  job: WorkerJobEnvelope,
  result: Awaited<ReturnType<typeof runPublishJob>>,
): WorkerEvent[] {
  const timestamp = new Date().toISOString();
  const message =
    result.status === 'idempotent'
      ? 'Publish worker returned idempotent success (stub adapter).'
      : 'Publish worker completed via RecipeSpec-only stub adapter.';
  return [
    {
      type: 'JOB_STARTED',
      jobId: job.id,
      queueName: job.queueName,
      trace: job.trace,
      timestamp,
      progress: 0,
      message: 'Publish worker started.',
      metadata: { adapter: 'stub', publishStatus: result.status },
    },
    {
      type: 'JOB_COMPLETED',
      jobId: job.id,
      queueName: job.queueName,
      trace: job.trace,
      timestamp: new Date().toISOString(),
      progress: 100,
      message,
      metadata: { moduleId: result.moduleId, versionId: result.versionId, publishStatus: result.status },
    },
  ];
}

export type PublishProcessorOptions = {
  adapter?: PublishExecutionAdapter;
  logger: WorkerLogger;
};

export function createPublishProcessor(options: PublishProcessorOptions) {
  const adapter = options.adapter ?? createStubPublishExecutionAdapter();

  return async (job: WorkerJobEnvelope): Promise<WorkerProcessorResult> => {
    const parsed = PublishPayloadSchema.parse(job.payload);
    if (parsed.dryRun) {
      options.logger.info('publish dry-run acknowledged', {
        jobId: job.id,
        moduleId: parsed.moduleId,
        correlationId: job.trace.correlationId,
      });
      const timestamp = new Date().toISOString();
      return {
        status: 'SUCCESS',
        events: [
          {
            type: 'JOB_STARTED',
            jobId: job.id,
            queueName: job.queueName,
            trace: job.trace,
            timestamp,
            progress: 0,
            message: 'Publish dry-run validated; no Shopify apply in worker stub.',
          },
          {
            type: 'JOB_COMPLETED',
            jobId: job.id,
            queueName: job.queueName,
            trace: job.trace,
            timestamp: new Date().toISOString(),
            progress: 100,
            message: 'Dry-run complete.',
            metadata: { dryRun: true },
          },
        ],
      };
    }

    const payload = toPublishJobPayload(job, parsed);
    try {
      const result = await runPublishJob(payload, adapter);
      return {
        status: 'SUCCESS',
        events: publishEventsFromResult(job, result),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.logger.error('publish worker failed', {
        jobId: job.id,
        moduleId: parsed.moduleId,
        correlationId: job.trace.correlationId,
        message,
      });
      return {
        status: 'FAILED',
        events: [
          {
            type: 'JOB_FAILED',
            jobId: job.id,
            queueName: job.queueName,
            trace: job.trace,
            timestamp: new Date().toISOString(),
            progress: 100,
            message,
            metadata: { moduleId: parsed.moduleId },
          },
        ],
      };
    }
  };
}

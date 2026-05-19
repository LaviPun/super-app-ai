import { FlowRunPayloadSchema, WebhookReceivedPayloadSchema, type WorkerEvent } from '@superapp/platform-contracts';
import type { z } from 'zod';
import type { JobLedgerRepository } from '@superapp/db';
import type { WorkerLogger } from './logger.js';
import type { WorkerJobEnvelope, WorkerProcessorResult } from './processors.js';

export type WebhookFlowAdapter = {
  handleWebhook(input: {
    shopDomain: string;
    topic: string;
    eventId: string;
    payload?: Record<string, unknown>;
    trace: WorkerJobEnvelope['trace'];
  }): Promise<{ flowJobsEnqueued: number; trigger?: string }>;
  runFlow(input: {
    flowId: string;
    trigger: 'MANUAL' | 'SCHEDULED' | 'SHOPIFY_WEBHOOK_ORDER_CREATED' | 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED';
    event?: Record<string, unknown>;
    replayOfJobId?: string;
    trace: WorkerJobEnvelope['trace'];
  }): Promise<{ steps: number; replayable: boolean }>;
};

type FlowRunPayload = z.infer<typeof FlowRunPayloadSchema>;

export class StubWebhookFlowAdapter implements WebhookFlowAdapter {
  async handleWebhook(input: { topic: string }): Promise<{ flowJobsEnqueued: number; trigger?: string }> {
    return {
      flowJobsEnqueued: input.topic === 'orders/create' || input.topic === 'products/update' ? 1 : 0,
      trigger: topicToTrigger(input.topic),
    };
  }

  async runFlow(input: { replayOfJobId?: string }): Promise<{ steps: number; replayable: boolean }> {
    return { steps: 0, replayable: Boolean(input.replayOfJobId) };
  }
}

export type WebhookFlowProcessorOptions = {
  adapter: WebhookFlowAdapter;
  jobRepository?: JobLedgerRepository;
  logger: WorkerLogger;
};

export function createWebhookProcessor(options: WebhookFlowProcessorOptions) {
  return async (job: WorkerJobEnvelope): Promise<WorkerProcessorResult> => {
    const payload = WebhookReceivedPayloadSchema.parse(job.payload);
    await options.jobRepository?.update(job.id, { status: 'RUNNING', attempts: 1, startedAt: new Date().toISOString() });
    const started = event(job, 'JOB_STARTED', 5, 'Webhook processing started');
    try {
      const result = await options.adapter.handleWebhook({ ...payload, trace: job.trace });
      await options.jobRepository?.update(job.id, {
        status: 'SUCCESS',
        result,
        finishedAt: new Date().toISOString(),
      });
      options.logger.info('webhook job completed', {
        jobId: job.id,
        topic: payload.topic,
        eventId: payload.eventId,
      });
      return {
        status: 'SUCCESS',
        events: [
          started,
          event(job, 'JOB_PROGRESS', 90, 'Webhook receipt processed', result),
          event(job, 'JOB_COMPLETED', 100, 'Webhook processing completed', result),
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await options.jobRepository?.update(job.id, { status: 'FAILED', error: message, finishedAt: new Date().toISOString() });
      throw err;
    }
  };
}

export function createFlowRunProcessor(options: WebhookFlowProcessorOptions) {
  return async (job: WorkerJobEnvelope): Promise<WorkerProcessorResult> => {
    const payload: FlowRunPayload = FlowRunPayloadSchema.parse(job.payload);
    await options.jobRepository?.update(job.id, { status: 'RUNNING', attempts: 1, startedAt: new Date().toISOString() });
    const started = event(job, 'JOB_STARTED', 5, 'Flow run started');
    try {
      const result = await options.adapter.runFlow({ ...payload, trace: job.trace });
      await options.jobRepository?.update(job.id, {
        status: 'SUCCESS',
        result,
        finishedAt: new Date().toISOString(),
      });
      options.logger.info('flow run job completed', {
        jobId: job.id,
        flowId: payload.flowId,
        trigger: payload.trigger,
        replayOfJobId: payload.replayOfJobId,
      });
      return {
        status: 'SUCCESS',
        events: [
          started,
          event(job, 'JOB_PROGRESS', 90, 'Flow runner adapter completed', result),
          event(job, 'JOB_COMPLETED', 100, 'Flow run completed', result),
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await options.jobRepository?.update(job.id, { status: 'FAILED', error: message, finishedAt: new Date().toISOString() });
      throw err;
    }
  };
}

function topicToTrigger(topic: string): string | undefined {
  if (topic === 'orders/create') return 'SHOPIFY_WEBHOOK_ORDER_CREATED';
  if (topic === 'products/update') return 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED';
  return undefined;
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

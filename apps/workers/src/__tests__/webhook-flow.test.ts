import { describe, expect, it, vi } from 'vitest';
import { InMemoryJobLedgerRepository, createQueuedJob } from '@superapp/db';
import { createFlowRunProcessor, createWebhookProcessor } from '../webhook-flow.js';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('webhook and flow workers', () => {
  it('processes webhook receipts through an adapter and records success', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const { record } = await createQueuedJob(repository, {
      type: 'WEBHOOK_RECEIVED',
      payload: {
        shopDomain: 'demo.myshopify.com',
        topic: 'orders/create',
        eventId: 'evt-1',
        payload: { id: 1 },
      },
      trace: { correlationId: 'corr-webhook-1' },
    });
    const adapter = {
      handleWebhook: vi.fn(async () => ({ flowJobsEnqueued: 1, trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED' })),
      runFlow: vi.fn(),
    };

    const result = await createWebhookProcessor({ adapter, jobRepository: repository, logger })({
      id: record.id,
      type: 'WEBHOOK_RECEIVED',
      queueName: 'webhook-processing',
      payload: record.payload,
      trace: record.trace,
    });

    expect(result.status).toBe('SUCCESS');
    expect(adapter.handleWebhook).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'evt-1',
      topic: 'orders/create',
    }));
    expect((await repository.findById(record.id))?.status).toBe('SUCCESS');
  });

  it('runs replayable flow jobs through an adapter', async () => {
    const repository = new InMemoryJobLedgerRepository();
    const { record } = await createQueuedJob(repository, {
      type: 'FLOW_RUN',
      payload: {
        flowId: 'flow-1',
        trigger: 'MANUAL',
        event: { kind: 'manual' },
        replayOfJobId: 'job_failed_1',
      },
      trace: { correlationId: 'corr-flow-1' },
    });
    const adapter = {
      handleWebhook: vi.fn(),
      runFlow: vi.fn(async () => ({ steps: 2, replayable: true })),
    };

    const result = await createFlowRunProcessor({ adapter, jobRepository: repository, logger })({
      id: record.id,
      type: 'FLOW_RUN',
      queueName: 'flow-execution',
      payload: record.payload,
      trace: record.trace,
    });

    expect(result.status).toBe('SUCCESS');
    expect(adapter.runFlow).toHaveBeenCalledWith(expect.objectContaining({
      flowId: 'flow-1',
      replayOfJobId: 'job_failed_1',
    }));
    expect((await repository.findById(record.id))?.result).toMatchObject({ replayable: true });
  });
});

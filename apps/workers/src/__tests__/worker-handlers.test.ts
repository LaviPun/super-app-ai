import { describe, expect, it } from 'vitest';
import { createAiGenerationHandler } from '../handlers/ai-generation-handler.js';
import { createConnectorHandler } from '../handlers/connector-handler.js';
import { createFlowHandler } from '../handlers/flow-handler.js';
import { createPublishHandler } from '../handlers/publish-handler.js';
import { createWebhookHandler } from '../handlers/webhook-handler.js';

const trace = { correlationId: 'corr_test', shopId: 'shop_1' };

describe('ai generation handler', () => {
  it('returns structured stub recipe spec for valid payload', async () => {
    const handler = createAiGenerationHandler();
    const result = await handler({
      id: 'job_ai_1',
      queueName: 'ai-generation',
      jobType: 'AI_GENERATE',
      payload: {
        jobId: 'job_ai_1',
        shopId: 'shop_1',
        intentKey: 'promo.banner',
        prompt: 'Summer sale banner',
      },
      trace,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.result).toMatchObject({
      status: 'success',
      model: 'platform-v2-stub',
    });
  });
});

describe('webhook handler', () => {
  it('validates payload and emits webhook events', async () => {
    const handler = createWebhookHandler();
    const result = await handler({
      id: 'job_wh_1',
      queueName: 'webhook',
      jobType: 'WEBHOOK_PROCESS',
      payload: {
        jobId: 'job_wh_1',
        shopId: 'shop_1',
        topic: 'orders/create',
        webhookId: 'wh_1',
        payload: { id: 1 },
        receivedAt: new Date().toISOString(),
      },
      trace,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.result).toMatchObject({ processed: true, topic: 'orders/create' });
  });
});

describe('flow handler', () => {
  it('validates flow run payload', async () => {
    const handler = createFlowHandler();
    const result = await handler({
      id: 'job_flow_1',
      queueName: 'flow',
      jobType: 'FLOW_RUN',
      payload: {
        jobId: 'job_flow_1',
        shopId: 'shop_1',
        flowId: 'flow_abc',
        trigger: 'manual',
      },
      trace,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.result).toMatchObject({ flowId: 'flow_abc', status: 'completed' });
  });
});

describe('connector handler', () => {
  it('rejects SSRF-unsafe base URLs', async () => {
    const handler = createConnectorHandler();
    const result = await handler({
      id: 'job_conn_1',
      queueName: 'connector',
      jobType: 'CONNECTOR_TEST',
      payload: {
        jobId: 'job_conn_1',
        shopId: 'shop_1',
        connectorId: 'conn_1',
        operation: 'CONNECTOR_TEST',
        baseUrl: 'https://127.0.0.1',
      },
      trace,
    });

    expect(result.status).toBe('FAILED');
  });
});

describe('publish handler', () => {
  it('returns ready when recipe spec passes preflight', async () => {
    const handler = createPublishHandler();
    const result = await handler({
      id: 'job_pub_1',
      queueName: 'publish',
      jobType: 'PUBLISH',
      payload: {
        jobId: 'job_pub_1',
        shopId: 'shop_1',
        moduleId: 'mod_1',
        revisionId: 'rev_1',
        target: 'theme',
        recipeSpec: { modules: [{ catalogId: 'generic.config_block' }] },
        idempotencyKey: 'idem_1',
      },
      trace,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.result).toMatchObject({ status: 'ready' });
  });

  it('blocks publish when recipe spec is empty', async () => {
    const handler = createPublishHandler();
    const result = await handler({
      id: 'job_pub_2',
      queueName: 'publish',
      jobType: 'PUBLISH',
      payload: {
        jobId: 'job_pub_2',
        shopId: 'shop_1',
        moduleId: 'mod_1',
        revisionId: 'rev_1',
        target: 'theme',
        recipeSpec: { modules: [] },
        idempotencyKey: 'idem_2',
      },
      trace,
    });

    expect(result.status).toBe('FAILED');
  });
});

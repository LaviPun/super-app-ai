import { describe, expect, it, beforeEach } from 'vitest';
import { buildApp } from '../index.js';
import type { ApiEnv } from '../env.js';
import { WorkerEventSchema } from '@superapp/platform-contracts';

const testEnv: ApiEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  API_SERVICE_VERSION: 'test',
  JOB_EXECUTION_MODE: 'queue',
  QUEUE_PROVIDER: 'memory',
  JOB_STORE_PROVIDER: 'memory',
  QUEUE_PREFIX: 'test',
  QUEUE_DEFAULT_ATTEMPTS: 2,
  QUEUE_DEFAULT_BACKOFF_MS: 10,
};

describe('API health routes', () => {
  beforeEach(() => {
    delete process.env.SHOPIFY_API_SECRET;
    delete process.env.API_RATE_LIMIT_MAX;
    delete process.env.API_RATE_LIMIT_WINDOW_MS;
  });

  it('GET /health returns ok payload', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('api');
    await app.close();
  });

  it('POST /v1/jobs validates payload and returns 202', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        type: 'AI_GENERATE',
        payload: { prompt: 'hello' },
        trace: { correlationId: 'corr-test-1' },
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      status: 'QUEUED',
      queueName: 'ai-generation',
      deduped: false,
      links: {
        status: expect.stringContaining('/v1/jobs/'),
        events: expect.stringContaining('/events'),
      },
    });
    await app.close();
  });

  it('POST /v1/jobs is idempotent for repeated keys', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const payload = {
      type: 'PUBLISH',
      payload: { moduleId: 'mod-1', dryRun: true },
      idempotencyKey: 'publish-mod-1-dry-run',
      trace: { correlationId: 'corr-test-3' },
    };
    const first = await app.inject({ method: 'POST', url: '/v1/jobs', payload });
    const second = await app.inject({ method: 'POST', url: '/v1/jobs', payload });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(second.json()).toMatchObject({
      jobId: first.json().jobId,
      queueName: 'publish-execution',
      deduped: true,
    });
    await app.close();
  });

  it('GET /v1/jobs/:jobId returns the stored job ledger record', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const enqueued = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        type: 'FLOW_RUN',
        payload: { flowId: 'flow-1', trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED' },
        trace: { correlationId: 'corr-test-4' },
      },
    });
    const jobId = enqueued.json().jobId;
    const fetched = await app.inject({ method: 'GET', url: `/v1/jobs/${jobId}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({
      id: jobId,
      type: 'FLOW_RUN',
      queueName: 'flow-execution',
      status: 'QUEUED',
      transportStatus: 'queued',
      links: {
        status: `/v1/jobs/${jobId}`,
        events: `/v1/jobs/${jobId}/events`,
      },
    });
    await app.close();
  });

  it('persists job event backlog for SSE consumers', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const enqueued = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        type: 'CONNECTOR_TEST',
        payload: { connectorId: 'conn-1', path: '/health' },
        trace: { correlationId: 'corr-test-events-1' },
      },
    });
    const jobId = enqueued.json().jobId as string;
    await app.jobs.events.publish(WorkerEventSchema.parse({
      type: 'JOB_STARTED',
      jobId,
      queueName: 'connector-execution',
      trace: { correlationId: 'corr-test-events-1' },
      timestamp: new Date().toISOString(),
      message: 'Connecting',
    }));

    const backlog = await app.jobs.events.list(jobId);
    expect(backlog).toHaveLength(1);
    expect(backlog[0]?.message).toBe('Connecting');
    expect(enqueued.json().links?.events).toBe(`/v1/jobs/${jobId}/events`);
    await app.close();
  });

  it('can use repository-backed job store boundary', async () => {
    const app = await buildApp({ env: { ...testEnv, JOB_STORE_PROVIDER: 'repository' }, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        type: 'WEBHOOK_RECEIVED',
        payload: { shopDomain: 'demo.myshopify.com', topic: 'orders/create', eventId: 'evt-1' },
        idempotencyKey: 'webhook-demo-orders-create-evt-1',
        trace: { correlationId: 'corr-test-db-1' },
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      queueName: 'webhook-processing',
      deduped: false,
    });
    const again = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        type: 'WEBHOOK_RECEIVED',
        payload: { shopDomain: 'demo.myshopify.com', topic: 'orders/create', eventId: 'evt-1' },
        idempotencyKey: 'webhook-demo-orders-create-evt-1',
        trace: { correlationId: 'corr-test-db-1' },
      },
    });
    expect(again.json()).toMatchObject({
      jobId: res.json().jobId,
      deduped: true,
    });
    await app.close();
  });

  it('POST /v1/jobs rejects invalid payload', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        type: 'AI_GENERATE',
        payload: {},
        trace: { correlationId: 'corr-test-2' },
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /v1/internal/assistant/jobs enqueues isolated assistant work', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/assistant/jobs',
      payload: {
        sessionId: 'sess-1',
        message: 'Summarize failed jobs',
        target: 'localMachine',
        clientRequestId: 'request-abc',
        idempotencyKey: 'internal-assistant-request-abc',
        trace: { correlationId: 'corr-internal-api-1' },
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      queueName: 'internal-tool-run',
      status: 'QUEUED',
      links: {
        status: expect.stringContaining('/v1/internal/assistant/jobs/'),
        events: expect.stringContaining('/events'),
      },
    });
    await app.close();
  });

  it('GET /v1/internal/assistant/jobs/:jobId returns status with event backlog', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const enqueued = await app.inject({
      method: 'POST',
      url: '/v1/internal/assistant/jobs',
      payload: {
        sessionId: 'sess-2',
        message: 'Check queue status',
        trace: { correlationId: 'corr-internal-api-2' },
      },
    });
    const jobId = enqueued.json().jobId;
    await app.jobs.events.publish(WorkerEventSchema.parse({
      type: 'JOB_STARTED',
      jobId,
      queueName: 'internal-tool-run',
      trace: { correlationId: 'corr-internal-api-2' },
      timestamp: new Date().toISOString(),
      progress: 5,
    }));

    const fetched = await app.inject({ method: 'GET', url: `/v1/internal/assistant/jobs/${jobId}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({
      id: jobId,
      type: 'INTERNAL_TOOL_RUN',
      queueName: 'internal-tool-run',
      events: [expect.objectContaining({ type: 'JOB_STARTED' })],
    });
    await app.close();
  });

  it('POST /v1/webhooks/shopify acknowledges and dedupes webhook receipts', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const payload = {
      shopDomain: 'demo.myshopify.com',
      topic: 'orders/create',
      eventId: 'evt-duplicate-1',
      payload: { admin_graphql_api_id: 'gid://shopify/Order/1' },
    };
    const first = await app.inject({ method: 'POST', url: '/v1/webhooks/shopify', payload });
    const second = await app.inject({ method: 'POST', url: '/v1/webhooks/shopify', payload });

    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({
      queueName: 'webhook-processing',
      acknowledged: true,
      duplicate: false,
    });
    expect(second.statusCode).toBe(202);
    expect(second.json()).toMatchObject({
      jobId: first.json().jobId,
      duplicate: true,
    });
    await app.close();
  });

  it('POST /v1/flows/run enqueues manual and replayable flow runs', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const manual = await app.inject({
      method: 'POST',
      url: '/v1/flows/run',
      payload: {
        flowId: 'flow-1',
        trigger: 'MANUAL',
        event: { kind: 'manual' },
        trace: { correlationId: 'corr-flow-api-1' },
      },
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/flows/run',
      payload: {
        flowId: 'flow-1',
        trigger: 'MANUAL',
        replayOfJobId: manual.json().jobId,
        trace: { correlationId: 'corr-flow-api-2' },
      },
    });

    expect(manual.statusCode).toBe(202);
    expect(manual.json()).toMatchObject({ queueName: 'flow-execution', deduped: false });
    expect(replay.statusCode).toBe(202);
    expect(replay.json()).toMatchObject({ queueName: 'flow-execution', deduped: false });
    await app.close();
  });
});

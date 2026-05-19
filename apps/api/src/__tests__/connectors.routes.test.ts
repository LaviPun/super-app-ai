import { describe, expect, it } from 'vitest';
import { buildApp } from '../index.js';
import type { ApiEnv } from '../env.js';

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

describe('connector enqueue routes', () => {
  it('POST /v1/connectors/test enqueues async work without inline execution', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/connectors/test',
      payload: {
        payload: {
          connectorId: 'conn-1',
          path: '/v1/ping',
          method: 'GET',
        },
        trace: { correlationId: 'corr-connector-api-1' },
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      status: 'QUEUED',
      queueName: 'connector-execution',
      deduped: false,
    });

    const jobId = res.json().jobId as string;
    const status = await app.inject({ method: 'GET', url: `/v1/jobs/${jobId}` });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      id: jobId,
      type: 'CONNECTOR_TEST',
      queueName: 'connector-execution',
    });
    await app.close();
  });

  it('POST /v1/connectors/call validates endpoint contract', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/connectors/call',
      payload: {
        payload: {
          connectorId: 'conn-1',
          endpointId: 'endpoint-1',
          input: { ping: true },
        },
        trace: { correlationId: 'corr-connector-api-2' },
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ queueName: 'connector-execution' });
    await app.close();
  });

  it('rejects CONNECTOR_TEST payloads missing path and endpointId', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/connectors/test',
      payload: {
        payload: { connectorId: 'conn-1' },
        trace: { correlationId: 'corr-connector-api-3' },
      },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('blocks absolute URLs supplied in connector test path overrides', async () => {
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/connectors/test',
      payload: {
        payload: {
          connectorId: 'conn-1',
          path: 'https://169.254.169.254/latest/meta-data',
        },
        trace: { correlationId: 'corr-connector-api-4' },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'UNSAFE_CONNECTOR_PATH' });
    await app.close();
  });
});

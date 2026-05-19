import { describe, expect, it } from 'vitest';
import { buildApp } from '../index.js';
import type { ApiEnv } from '../env.js';
import { generateTraceParent } from '@superapp/observability';

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

describe('API observability plugin', () => {
  it('propagates trace headers on responses and job enqueue', async () => {
    const traceparent = generateTraceParent(true);
    const app = await buildApp({ env: testEnv, logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: {
        'x-request-id': 'req-obs-1',
        'x-correlation-id': 'corr-obs-1',
        traceparent,
        tracestate: 'vendor=1',
      },
      payload: {
        type: 'AI_GENERATE',
        payload: { prompt: 'hello' },
        trace: { correlationId: 'corr-obs-1' },
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.headers['x-request-id']).toBe('req-obs-1');
    expect(res.headers['x-correlation-id']).toBe('corr-obs-1');
    expect(res.headers.traceparent).toBe(traceparent);

    const jobId = res.json().jobId as string;
    const stored = await app.jobs.store.get(jobId);
    expect(stored?.trace.traceparent).toBe(traceparent);
    expect(stored?.trace.tracestate).toBe('vendor=1');
    await app.close();
  });
});

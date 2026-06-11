import { describe, expect, it } from 'vitest';
import { buildApp } from '../index.js';

const baseEnv = {
  NODE_ENV: 'test' as const,
  PORT: 3001,
  HOST: '127.0.0.1',
  API_SERVICE_VERSION: 'test',
  JOB_EXECUTION_MODE: 'queue' as const,
  QUEUE_PROVIDER: 'memory' as const,
  JOB_STORE_PROVIDER: 'memory' as const,
  JOB_LEDGER_DRIVER: 'memory' as const,
  QUEUE_PREFIX: 'test',
  QUEUE_DEFAULT_ATTEMPTS: 3,
  QUEUE_DEFAULT_BACKOFF_MS: 1000,
};

describe('rollout cutover plugin', () => {
  it('returns 503 for /v1 routes when FASTIFY_API_ENABLED is off', async () => {
    const previous = process.env.FASTIFY_API_ENABLED;
    delete process.env.FASTIFY_API_ENABLED;
    const app = await buildApp({
      env: baseEnv,
      logger: false,
    });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    const gated = await app.inject({ method: 'GET', url: '/v1/jobs/job-1' });
    expect(gated.statusCode).toBe(503);
    expect(gated.json()).toMatchObject({ error: 'FASTIFY_API_DISABLED' });

    await app.close();
    if (previous === undefined) delete process.env.FASTIFY_API_ENABLED;
    else process.env.FASTIFY_API_ENABLED = previous;
  });

  it('allows /v1 routes when FASTIFY_API_ENABLED is on', async () => {
    const previous = process.env.FASTIFY_API_ENABLED;
    process.env.FASTIFY_API_ENABLED = 'true';
    const app = await buildApp({
      env: baseEnv,
      logger: false,
    });

    const response = await app.inject({ method: 'GET', url: '/v1/jobs/missing' });
    expect(response.statusCode).toBe(404);

    await app.close();
    if (previous === undefined) delete process.env.FASTIFY_API_ENABLED;
    else process.env.FASTIFY_API_ENABLED = previous;
  });
});

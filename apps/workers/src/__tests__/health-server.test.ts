import { describe, expect, it } from 'vitest';
import { createWorkerHealthServer } from '../health-server.js';
import { loadWorkerEnv } from '../env.js';

describe('worker health server', () => {
  it('GET /health returns workers service payload', async () => {
    const env = loadWorkerEnv({ NODE_ENV: 'test' });
    const health = createWorkerHealthServer({
      env,
      getReadinessChecks: () => ({ config: true, runtime: true }),
    });

    await new Promise<void>((resolve) => {
      health.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = health.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      service: 'workers',
      version: env.WORKER_SERVICE_VERSION,
    });

    await health.close();
  });

  it('GET /ready returns 503 when runtime is not started', async () => {
    const env = loadWorkerEnv({ NODE_ENV: 'test' });
    const health = createWorkerHealthServer({
      env,
      getReadinessChecks: () => ({ config: true, runtime: false }),
    });

    await new Promise<void>((resolve) => {
      health.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = health.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/ready`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { checks: Record<string, boolean> };
    expect(body.checks).toMatchObject({ config: true, runtime: false });

    await health.close();
  });
});

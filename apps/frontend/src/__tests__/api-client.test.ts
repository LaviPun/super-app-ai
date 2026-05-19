import { describe, expect, it, vi } from 'vitest';
import { enqueueJob, fetchApiHealth } from '../lib/api-client.js';
import { merchantRoutes, internalRoutes } from '../routes/legacy-route-map.js';

describe('fetchApiHealth', () => {
  it('parses health response from API', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ok: true,
        service: 'api',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
      }),
    );
    const health = await fetchApiHealth({
      baseUrl: 'http://127.0.0.1:3001',
      fetchImpl,
    });
    expect(health.service).toBe('api');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('enqueues jobs through Fastify contract boundary', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        jobId: 'job_000001',
        queueName: 'ai-generation',
        status: 'QUEUED',
        deduped: false,
      }, { status: 202 }),
    );
    const response = await enqueueJob({
      baseUrl: 'http://127.0.0.1:3001',
      fetchImpl,
    }, {
      type: 'AI_GENERATE',
      payload: { prompt: 'hello' },
      trace: { correlationId: 'corr-frontend-1' },
    });
    expect(response.queueName).toBe('ai-generation');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/v1/jobs',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('legacy route parity map', () => {
  it('covers merchant and internal surfaces from Remix navigation', () => {
    expect(merchantRoutes.map((route) => route.label)).toEqual([
      'Home',
      'AI modules',
      'Jobs',
      'Advanced features',
      'Data models',
      'Billing',
      'Settings',
    ]);
    expect(internalRoutes.map((route) => route.label)).toEqual([
      'Dashboard',
      'Monitoring',
      'Data',
      'AI Assistant',
      'Configuration',
    ]);
    expect(merchantRoutes.find((route) => route.label === 'Jobs')?.apiBoundary).toContain('/v1/jobs');
  });
});

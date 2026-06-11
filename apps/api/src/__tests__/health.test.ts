import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../index.js';
import { resetJobOrchestratorForTests } from '../routes/jobs.js';

describe('api health', () => {
  afterEach(() => {
    resetJobOrchestratorForTests();
  });

  it('returns ok from /health', async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: '@superapp/api' });
  });

  it('enqueues preview export jobs in inline mode', async () => {
    process.env.JOB_EXECUTION_MODE = 'inline';
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/jobs/enqueue',
      payload: {
        jobType: 'PREVIEW_EXPORT',
        shopId: 'shop_1',
        payload: {
          type: 'PREVIEW_EXPORT',
          jobId: 'job_api_1',
          shopId: 'shop_1',
          moduleId: 'module_1',
          assetId: 'preview_module_1',
          preview: { contentType: 'text/html', body: '<section>API</section>' },
        },
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.result.status).toBe('completed');
  });
});

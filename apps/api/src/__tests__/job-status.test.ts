import { describe, expect, it } from 'vitest';
import { buildApp } from '../index.js';
import { getJobOrchestrator, resetJobOrchestratorForTests } from '../routes/jobs.js';
import { resetJobStatusStore } from '@superapp/job-orchestration';

describe('job status route', () => {
  it('returns job status after enqueue', async () => {
    resetJobOrchestratorForTests();
    resetJobStatusStore();
    process.env.PLATFORM_V2_ENABLED = 'true';
    process.env.FASTIFY_API_ENABLED = 'true';
    process.env.JOB_EXECUTION_MODE = 'inline';

    const app = await buildApp();
    const orchestrator = getJobOrchestrator();

    const enqueue = await app.inject({
      method: 'POST',
      url: '/v1/jobs/enqueue',
      payload: {
        jobType: 'AI_GENERATE',
        payload: {
          jobId: 'job_status_1',
          shopId: 'shop_1',
          intentKey: 'promo.banner',
          prompt: 'test',
        },
        shopId: 'shop_1',
      },
    });

    expect(enqueue.statusCode).toBe(202);
    const body = enqueue.json() as { jobId: string };
    expect(orchestrator.executionMode).toBe('inline');

    const status = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${body.jobId}`,
    });

    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      jobId: body.jobId,
      status: 'SUCCESS',
      jobType: 'AI_GENERATE',
    });
  });
});

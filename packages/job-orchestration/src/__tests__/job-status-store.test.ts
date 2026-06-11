import { describe, expect, it } from 'vitest';
import { InMemoryJobStatusStore } from '../job-status-store.js';

describe('InMemoryJobStatusStore', () => {
  it('stores and retrieves job status records', async () => {
    const store = new InMemoryJobStatusStore();
    await store.upsert({
      jobId: 'job_1',
      jobType: 'AI_GENERATE',
      queueName: 'ai-generation',
      status: 'QUEUED',
      correlationId: 'corr_1',
      updatedAt: new Date().toISOString(),
    });

    const record = await store.get('job_1');
    expect(record?.status).toBe('QUEUED');
  });
});

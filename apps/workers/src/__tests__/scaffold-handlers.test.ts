import { describe, expect, it } from 'vitest';
import { createScaffoldWorkerHandlers } from '../handlers/scaffold-handlers.js';

describe('worker handlers registry', () => {
  it('returns success for ai-generation queue', async () => {
    const handlers = createScaffoldWorkerHandlers();
    const aiHandler = handlers['ai-generation'];
    expect(aiHandler).toBeDefined();

    const result = await aiHandler!({
      id: 'job_scaffold_1',
      queueName: 'ai-generation',
      jobType: 'AI_GENERATE',
      payload: {
        jobId: 'job_scaffold_1',
        shopId: 'shop_1',
        intentKey: 'promo.banner',
        prompt: 'test',
      },
      trace: { correlationId: 'corr_1', shopId: 'shop_1' },
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.result).toMatchObject({ status: 'success' });
  });
});

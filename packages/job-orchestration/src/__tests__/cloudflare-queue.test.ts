import { describe, expect, it } from 'vitest';
import { createCloudflareQueueAdapter } from '../cloudflare-queue.js';

describe('createCloudflareQueueAdapter', () => {
  it('sends JobEnvelope payload to the matching queue binding', async () => {
    const sent: unknown[] = [];
    const adapter = createCloudflareQueueAdapter({
      'asset-storage': {
        send: async (body: unknown) => {
          sent.push(body);
        },
      } as CloudflareQueueSender,
    });

    const result = await adapter.enqueue({
      id: 'job_1',
      queueName: 'asset-storage',
      jobType: 'PREVIEW_EXPORT',
      payload: { type: 'PREVIEW_EXPORT' },
      trace: { correlationId: 'corr_1', shopId: 'shop_1' },
    });

    expect(result).toEqual({ queueName: 'asset-storage', jobId: 'job_1' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      id: 'job_1',
      queueName: 'asset-storage',
      jobType: 'PREVIEW_EXPORT',
    });
  });

  it('throws when queue binding is missing', async () => {
    const adapter = createCloudflareQueueAdapter({});
    await expect(
      adapter.enqueue({
        id: 'job_2',
        queueName: 'publish',
        jobType: 'PUBLISH',
        payload: {},
        trace: { correlationId: 'corr_2' },
      }),
    ).rejects.toThrow('Cloudflare Queue binding missing for publish');
  });
});

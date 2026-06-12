import { describe, expect, it, vi } from 'vitest';
import { handleQueueBatch } from '../cloudflare-queue-consumer.js';

type TestMessage = {
  body: unknown;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};

function createMessage(body: unknown): TestMessage {
  return {
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

describe('cloudflare-queue-consumer', () => {
  it('acks asset-storage PREVIEW_EXPORT jobs', async () => {
    const message = createMessage({
      id: 'job_consumer_1',
      queueName: 'asset-storage',
      jobType: 'PREVIEW_EXPORT',
      payload: {
        type: 'PREVIEW_EXPORT',
        jobId: 'job_consumer_1',
        shopId: 'shop_1',
        moduleId: 'module_1',
        assetId: 'preview_module_1',
        preview: { contentType: 'text/html', body: '<section>queue consumer</section>' },
      },
      trace: { correlationId: 'job_consumer_1', shopId: 'shop_1' },
    });

    await handleQueueBatch({ messages: [message] } as unknown as MessageBatch<unknown>, {});

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('acks scaffold ai-generation jobs', async () => {
    const message = createMessage({
      id: 'job_consumer_ai',
      queueName: 'ai-generation',
      jobType: 'AI_GENERATE',
      payload: {
        jobId: 'job_consumer_ai',
        shopId: 'shop_1',
        intentKey: 'promo.banner',
        prompt: 'test',
      },
      trace: { correlationId: 'job_consumer_ai', shopId: 'shop_1' },
    });

    await handleQueueBatch({ messages: [message] } as unknown as MessageBatch<unknown>, {});

    expect(message.ack).toHaveBeenCalledOnce();
  });

  it('retries when handler throws', async () => {
    const message = createMessage({
      id: 'job_consumer_bad',
      queueName: 'asset-storage',
      jobType: 'PREVIEW_EXPORT',
      payload: { type: 'PREVIEW_EXPORT', jobId: 'bad' },
      trace: { correlationId: 'job_consumer_bad' },
    });

    await handleQueueBatch({ messages: [message] } as unknown as MessageBatch<unknown>, {});

    expect(message.retry).toHaveBeenCalledOnce();
  });

  it('acks invalid payloads without retry', async () => {
    const message = createMessage({ invalid: true });

    await handleQueueBatch({ messages: [message] } as unknown as MessageBatch<unknown>, {});

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });
});

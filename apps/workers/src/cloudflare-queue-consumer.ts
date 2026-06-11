/**
 * Cloudflare Queues consumer for asset-storage jobs.
 * BullMQ remains the local/transition path; this handler is the Cloudflare-native queue consumer.
 */
import { createImageStorageProcessor } from './image-storage.js';

type QueueMessage = {
  id: string;
  queueName: string;
  payload: unknown;
  trace?: {
    correlationId?: string;
    requestId?: string;
    shopId?: string;
  };
};

export default {
  async queue(batch: MessageBatch<QueueMessage>, env: { ASSETS?: R2Bucket }): Promise<void> {
    const processor = createImageStorageProcessor({
      storageAdapterOptions: {
        provider: env.ASSETS ? 'r2' : 'local',
        r2Bucket: env.ASSETS,
        r2BucketName: 'superapp-assets',
      },
    });

    for (const message of batch.messages) {
      try {
        const body = message.body;
        await processor({
          id: body.id,
          queueName: body.queueName ?? 'asset-storage',
          payload: body.payload,
          trace: {
            correlationId: body.trace?.correlationId ?? body.id,
            requestId: body.trace?.requestId,
            shopId: body.trace?.shopId,
          },
        });
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
};

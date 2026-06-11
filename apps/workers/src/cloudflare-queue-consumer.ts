/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Queues consumer for all platform job queues.
 * BullMQ remains the local/transition path; this handler is the Cloudflare-native queue consumer.
 */
import {
  createPlatformQueueHandlers,
  dispatchPlatformQueueJob,
  parseQueueMessageBody,
} from './platform-queue-dispatcher.js';

export interface WorkersConsumerEnv {
  ASSETS?: R2Bucket;
  R2_BUCKET_NAME?: string;
}

export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: WorkersConsumerEnv,
): Promise<void> {
  const handlers = createPlatformQueueHandlers({
    storageAdapterOptions: {
      provider: env.ASSETS ? 'r2' : 'local',
      r2Bucket: env.ASSETS,
      r2BucketName: env.R2_BUCKET_NAME ?? 'superapp-assets',
    },
  });

  for (const message of batch.messages) {
    const envelope = parseQueueMessageBody(message.body);
    if (!envelope) {
      message.ack();
      continue;
    }

    try {
      await dispatchPlatformQueueJob(envelope, handlers);
      message.ack();
    } catch {
      message.retry();
    }
  }
}

export default {
  async queue(batch: MessageBatch<unknown>, env: WorkersConsumerEnv): Promise<void> {
    await handleQueueBatch(batch, env);
  },
};

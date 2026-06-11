import type { PlatformQueueName } from '@superapp/platform-contracts';
import type { EnqueueJobInput, JobQueueAdapter } from './types.js';

export type CloudflareQueueSender = {
  send(body: unknown): Promise<unknown>;
};

export type CloudflareQueueBindings = Partial<Record<PlatformQueueName, CloudflareQueueSender>>;

export function createCloudflareQueueAdapter(bindings: CloudflareQueueBindings): JobQueueAdapter {
  return {
    async enqueue(input: EnqueueJobInput) {
      const queue = bindings[input.queueName];
      if (!queue) {
        throw new Error(`Cloudflare Queue binding missing for ${input.queueName}`);
      }

      await queue.send({
        id: input.id,
        queueName: input.queueName,
        jobType: input.jobType,
        payload: input.payload,
        trace: input.trace,
      });

      return { queueName: input.queueName, jobId: input.id };
    },
    async close() {
      // Cloudflare Queues bindings have no close lifecycle.
    },
  };
}

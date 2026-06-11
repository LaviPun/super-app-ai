import { WebhookPayloadSchema } from '@superapp/platform-contracts';
import type { JobHandler } from '@superapp/job-orchestration';
import { failureResult, successResult } from './handler-utils.js';

export function createWebhookHandler(): JobHandler {
  return async (job) => {
    const parsed = WebhookPayloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      return failureResult(job, 'webhook', {
        code: 'INVALID_WEBHOOK_PAYLOAD',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }, 'Webhook worker rejected invalid payload');
    }

    const payload = parsed.data;
    return successResult(
      job,
      'webhook',
      {
        jobId: payload.jobId,
        shopId: payload.shopId,
        topic: payload.topic,
        webhookId: payload.webhookId,
        processed: true,
        emittedEvents: [
          {
            type: 'WEBHOOK_RECEIVED',
            topic: payload.topic,
            shopId: payload.shopId,
          },
          {
            type: 'WEBHOOK_ACKED',
            webhookId: payload.webhookId,
          },
        ],
      },
      `Webhook ${payload.topic} processed`,
    );
  };
}

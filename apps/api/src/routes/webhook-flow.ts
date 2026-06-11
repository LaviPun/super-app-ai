import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { EnqueueJobRequestSchema, FlowRunPayloadSchema, WebhookReceivedPayloadSchema } from '@superapp/platform-contracts';
import { z } from 'zod';

type FlowRunPayload = z.infer<typeof FlowRunPayloadSchema>;

const WebhookIngressSchema = z.object({
  shopDomain: z.string().min(1),
  topic: z.string().min(1),
  eventId: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  hmac: z.string().optional(),
});

const FlowRunRequestSchema = z.object({
  flowId: z.string().min(1),
  trigger: z.enum(['MANUAL', 'SCHEDULED', 'SHOPIFY_WEBHOOK_ORDER_CREATED', 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED']).default('MANUAL'),
  event: z.record(z.unknown()).optional(),
  replayOfJobId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  trace: z.object({
    requestId: z.string().min(1).optional(),
    correlationId: z.string().min(1),
    shopId: z.string().min(1).optional(),
  }),
});

export async function registerWebhookFlowRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/webhooks/shopify', async (request, reply) => {
    const parsed = WebhookIngressSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_WEBHOOK_RECEIPT', details: parsed.error.flatten() });
    }
    if (parsed.data.hmac && !verifyWebhookHmac(JSON.stringify(parsed.data.payload ?? {}), parsed.data.hmac, process.env.SHOPIFY_API_SECRET)) {
      return reply.status(401).send({ error: 'INVALID_WEBHOOK_HMAC' });
    }

    const payload = WebhookReceivedPayloadSchema.parse({
      shopDomain: parsed.data.shopDomain,
      topic: parsed.data.topic,
      eventId: parsed.data.eventId,
      payload: parsed.data.payload,
    });
    const response = await app.jobs.orchestrator.enqueue(EnqueueJobRequestSchema.parse({
      type: 'WEBHOOK_RECEIVED',
      payload,
      idempotencyKey: `webhook:${payload.shopDomain}:${payload.topic}:${payload.eventId}`,
      trace: {
        correlationId: `webhook:${payload.eventId}`,
        shopId: payload.shopDomain,
      },
    }));

    return reply.status(202).send({
      ...response,
      duplicate: response.deduped,
      acknowledged: true,
    });
  });

  app.post('/v1/flows/run', async (request, reply) => {
    const parsed = FlowRunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_FLOW_RUN', details: parsed.error.flatten() });
    }
    const payload: FlowRunPayload = FlowRunPayloadSchema.parse({
      flowId: parsed.data.flowId,
      trigger: parsed.data.trigger,
      event: parsed.data.event,
      replayOfJobId: parsed.data.replayOfJobId,
    });
    const response = await app.jobs.orchestrator.enqueue(EnqueueJobRequestSchema.parse({
      type: 'FLOW_RUN',
      payload,
      idempotencyKey: parsed.data.idempotencyKey ?? (
        payload.replayOfJobId ? `flow-replay:${payload.replayOfJobId}` : undefined
      ),
      trace: parsed.data.trace,
    }));

    return reply.status(202).send(response);
  });
}

export function verifyWebhookHmac(body: string, headerHmac: string, secret?: string): boolean {
  if (!secret) return true;
  const digest = createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  const expected = Buffer.from(digest);
  const received = Buffer.from(headerHmac);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

import { getPrisma } from '~/db.server';
import { randomUUID } from 'node:crypto';

/**
 * Webhook idempotency guard.
 *
 * Shopify may deliver a webhook more than once (guaranteed-at-least-once delivery).
 * We use the X-Shopify-Webhook-Id header to deduplicate within 72 hours.
 *
 * Returns true if this is a NEW event (should be processed).
 * Returns false if the event was already processed (should be skipped).
 */
export async function checkAndMarkWebhookEvent(opts: {
  shopDomain: string;
  topic: string;
  eventId: string;
  success?: boolean;
}): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') return true;

  const prisma = getPrisma();
  try {
    await prisma.webhookEvent.create({
      data: {
        shopDomain: opts.shopDomain,
        topic: opts.topic,
        eventId: opts.eventId,
        success: opts.success ?? true,
      },
    });
    return true;
  } catch (err: any) {
    // P2002 = unique constraint violation → duplicate event
    if (err?.code === 'P2002') return false;
    throw err;
  }
}

/** Extract the Shopify webhook event ID from request headers. */
export function extractWebhookEventId(request: Request): string {
  // Shopify normally provides X-Shopify-Webhook-Id. If it's missing (e.g. proxies or replay tools),
  // a timestamp fallback can collide under bursty traffic and incorrectly dedupe distinct events.
  return request.headers.get('x-shopify-webhook-id') ?? randomUUID();
}

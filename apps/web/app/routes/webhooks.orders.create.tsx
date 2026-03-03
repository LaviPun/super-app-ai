import { shopify } from '~/shopify.server';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { checkAndMarkWebhookEvent, extractWebhookEventId } from '~/services/flows/idempotency.server';

export async function action({ request }: { request: Request }) {
  const { admin, payload, shop, topic } = await shopify.authenticate.webhook(request);

  const eventId = extractWebhookEventId(request);
  const isNew = await checkAndMarkWebhookEvent({ shopDomain: shop, topic, eventId });

  if (!isNew) {
    // Duplicate delivery — acknowledge without re-processing
    return new Response(undefined, { status: 200 });
  }

  const runner = new FlowRunnerService();
  await runner.runForTrigger(shop, admin, 'SHOPIFY_WEBHOOK_ORDER_CREATED', payload);

  return new Response(undefined, { status: 200 });
}

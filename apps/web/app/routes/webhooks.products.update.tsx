import { shopify } from '~/shopify.server';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { checkAndMarkWebhookEvent, extractWebhookEventId } from '~/services/flows/idempotency.server';
import type { AdminApiContext } from '~/types/shopify';

export async function action({ request }: { request: Request }) {
  const { admin, payload, shop, topic } = await shopify.authenticate.webhook(request);

  const eventId = extractWebhookEventId(request);
  const isNew = await checkAndMarkWebhookEvent({ shopDomain: shop, topic, eventId });

  if (!isNew) {
    return new Response(undefined, { status: 200 });
  }

  const runner = new FlowRunnerService();
  await runner.runForTrigger(
    shop,
    admin as unknown as AdminApiContext['admin'],
    'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
    payload,
  );

  return new Response(undefined, { status: 200 });
}

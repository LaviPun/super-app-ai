/**
 * GDPR: customers/data_request (doc Section 2.4).
 *
 * Shopify sends this when a customer requests their data. The app must
 * compile the customer's data and provide it to the store owner (who then
 * fulfils the customer's request) within 30 days — see
 * services/gdpr/data-request-export.server.ts for the model coverage and
 * delivery design.
 *
 * Idempotent: Shopify may redeliver the same webhook (X-Shopify-Webhook-Id),
 * so processing is claimed via the existing WebhookEvent dedup seam
 * (services/flows/idempotency.server) before compiling or emailing anything.
 * If compiling the export itself fails, the claim is released and the
 * handler 500s so Shopify retries; a delivery failure (unconfigured mailer,
 * unresolvable owner email, send failure) is NOT a processing failure — the
 * data was compiled, so this still acks 200, but records a loud, honest
 * failed-delivery state (ActivityLog + ErrorLog) instead of silently
 * dropping the request.
 *
 * Runs entirely inline (master's JOB_EXECUTION_MODE is inline; there is no
 * other async seam to hand this off to). This is safe because every query is
 * indexed (shopId/customerId) and row-capped (EXPORT_ROW_CAP per model), so
 * worst-case latency stays well inside the webhook timeout even before the
 * mailer call, which is itself bounded by the mailer's own SEND_TIMEOUT_MS.
 */

import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { checkAndMarkWebhookEvent, extractWebhookEventId, unmarkWebhookEvent } from '~/services/flows/idempotency.server';
import {
  compileCustomerDataExport,
  deliverCustomerDataExport,
  type GdprExportPrismaClient,
} from '~/services/gdpr/data-request-export.server';
import { ErrorLogService } from '~/services/observability/error-log.service';

const TOPIC = 'customers/data_request';

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { payload: webhookPayload } = await shopify.authenticate.webhook(request);

  const payload = webhookPayload as {
    shop_id?: number;
    shop_domain?: string;
    customer?: { id: number; email?: string };
    orders_requested?: number[];
  };
  const shopDomain = payload.shop_domain ?? payload.shop_id?.toString();
  if (!shopDomain)
    return new Response(JSON.stringify({ error: 'Missing shop identifier' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return new Response(undefined, { status: 200 });

  const customerId = payload.customer?.id != null ? String(payload.customer.id) : null;
  const customerEmail = payload.customer?.email ?? null;

  const eventId = extractWebhookEventId(request);
  const isNew = await checkAndMarkWebhookEvent({ shopDomain, topic: TOPIC, eventId });
  if (!isNew) return new Response(undefined, { status: 200 });

  let exportPayload;
  try {
    exportPayload = await compileCustomerDataExport(prisma as unknown as GdprExportPrismaClient, {
      shopId: shop.id,
      shopDomain,
      customerId,
      customerEmail,
      webhookEventId: eventId,
    });
  } catch (err) {
    // Nothing was compiled — release the claim so Shopify's redelivery is reprocessed
    // instead of being dropped as a duplicate, and 500 so Shopify actually redelivers.
    await unmarkWebhookEvent({ shopDomain, topic: TOPIC, eventId }).catch(() => {});
    await new ErrorLogService().error(
      `GDPR data_request export compilation failed for ${shopDomain}`,
      err instanceof Error ? err.stack : undefined,
      { shopDomain, customerId },
      err,
      'SERVER',
    );
    return new Response(undefined, { status: 500 });
  }

  const delivery = await deliverCustomerDataExport({ shopDomain, exportPayload }).catch(() => ({
    emailSent: false,
    mailerConfigured: false,
    recipientDomain: null,
    truncated: false,
    byteLength: 0,
    reason: 'delivery_threw',
  }));

  await prisma.activityLog.create({
    data: {
      actor: 'WEBHOOK',
      action: 'GDPR_DATA_REQUEST',
      resource: `customer:${customerId ?? 'shop'}`,
      shopId: shop.id,
      details: JSON.stringify({
        customerId,
        customerEmail,
        counts: exportPayload.counts,
        notes: exportPayload.notes,
        delivery,
      }),
    },
  });

  if (!delivery.emailSent) {
    // Loud, not silent: this is a compliance-relevant failure (data was compiled but
    // could not be delivered to the merchant) — ops-visible via ErrorLog, not just the
    // shop-scoped ActivityLog above.
    await new ErrorLogService().error(
      `GDPR data_request delivery failed for ${shopDomain}: ${delivery.reason ?? 'unknown'}`,
      undefined,
      { shopDomain, customerId, mailerConfigured: delivery.mailerConfigured, reason: delivery.reason },
      undefined,
      'SERVER',
    );
  }

  return new Response(undefined, { status: 200 });
}

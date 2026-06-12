import type { RouteHandler } from "gadget-server";

import {
  markWebhookEventFailed,
  recordWebhookEvent,
} from "../lib/shopify/webhookLedger";

const route: RouteHandler = async ({ request, reply, logger, api }) => {
  const shopDomainHeader = request.headers["x-shopify-shop-domain"];
  const topicHeader = request.headers["x-shopify-topic"];
  const webhookIdHeader = request.headers["x-shopify-webhook-id"];

  const shopDomain = Array.isArray(shopDomainHeader)
    ? shopDomainHeader[0]
    : shopDomainHeader;
  const topic = Array.isArray(topicHeader) ? topicHeader[0] : topicHeader;
  const webhookId = Array.isArray(webhookIdHeader)
    ? webhookIdHeader[0]
    : webhookIdHeader;

  if (!shopDomain || !topic || !webhookId) {
    await reply.code(400).send({
      ok: false,
      error: "Missing required Shopify webhook headers",
    });
    return;
  }

  let createdWebhookEventId: string | undefined;

  try {
    const ledgerResult = await recordWebhookEvent(api, {
      shopDomain,
      topic,
      webhookId,
      eventId: webhookId,
    });

    createdWebhookEventId = ledgerResult.webhookEventId;

    logger.info(
      {
        shopDomain,
        topic,
        webhookId,
        webhookEventId: ledgerResult.webhookEventId,
        isDuplicate: ledgerResult.isDuplicate,
        isNew: ledgerResult.isNew,
      },
      ledgerResult.isDuplicate
        ? "Duplicate Shopify webhook received"
        : "Accepted new Shopify webhook"
    );

    await reply.code(200).send({
      ok: true,
      accepted: true,
      isDuplicate: ledgerResult.isDuplicate,
      isNew: ledgerResult.isNew,
      webhookEventId: ledgerResult.webhookEventId,
    });
  } catch (error) {
    if (createdWebhookEventId) {
      try {
        await markWebhookEventFailed(api, createdWebhookEventId);
      } catch (markFailedError) {
        logger.error(
          {
            shopDomain,
            topic,
            webhookId,
            webhookEventId: createdWebhookEventId,
          },
          "Failed to mark Shopify webhook ledger record as failed"
        );
      }
    }

    logger.error(
      {
        shopDomain,
        topic,
        webhookId,
        webhookEventId: createdWebhookEventId,
      },
      "Failed to ingest Shopify webhook"
    );

    await reply.code(500).send({
      ok: false,
      error: "Failed to ingest Shopify webhook",
    });
  }
};

export default route;

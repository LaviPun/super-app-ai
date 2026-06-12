import type { GadgetAPI } from "gadget-server";

export type RecordWebhookEventParams = {
  shopDomain: string;
  topic: string;
  webhookId: string;
  eventId: string;
};

export type RecordWebhookEventResult = {
  webhookEventId: string;
  isDuplicate: boolean;
  isNew: boolean;
};

export const recordWebhookEvent = async (
  api: GadgetAPI,
  params: RecordWebhookEventParams
): Promise<RecordWebhookEventResult> => {
  const existing = await api.shopifyWebhookEvent.findFirst({
    filter: {
      eventId: { equals: params.eventId },
    },
    select: { id: true },
  });

  if (existing) {
    return {
      webhookEventId: existing.id,
      isDuplicate: true,
      isNew: false,
    };
  }

  const created = await api.shopifyWebhookEvent.create({
    shopDomain: params.shopDomain,
    topic: params.topic,
    webhookId: params.webhookId,
    eventId: params.eventId,
    status: "received",
  });

  return {
    webhookEventId: created.id,
    isDuplicate: false,
    isNew: true,
  };
};

export const markWebhookEventFailed = async (
  api: GadgetAPI,
  webhookEventId: string
): Promise<void> => {
  await api.shopifyWebhookEvent.update(webhookEventId, {
    status: "failed",
  });
};

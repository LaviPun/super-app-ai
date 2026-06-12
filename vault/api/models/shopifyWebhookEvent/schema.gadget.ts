import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v1",
  storageKey: "DataModel-ShopifyWebhookEvent",
  fields: {
    shopDomain: {
      type: "string",
      storageKey: "shopifyWebhookEvent-shopDomain",
    },
    topic: {
      type: "string",
      storageKey: "shopifyWebhookEvent-topic",
    },
    webhookId: {
      type: "string",
      storageKey: "shopifyWebhookEvent-webhookId",
    },
    eventId: {
      type: "string",
      storageKey: "shopifyWebhookEvent-eventId",
    },
    status: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["received", "processed", "failed"],
      storageKey: "shopifyWebhookEvent-status",
    },
  },
};

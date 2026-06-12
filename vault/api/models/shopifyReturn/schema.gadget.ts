import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v1",
  storageKey: "DataModel-Shopify-Return",
  fields: {},
  shopify: {
    fields: [
      "exchangeLineItems",
      "order",
      "refunds",
      "returnLineItems",
      "returnShippingFees",
      "reverseFulfillmentOrders",
      "shop",
    ],
  },
};

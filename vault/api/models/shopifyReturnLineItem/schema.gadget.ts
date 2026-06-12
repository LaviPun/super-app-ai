import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v1",
  storageKey: "DataModel-Shopify-ReturnLineItem",
  fields: {},
  shopify: {
    fields: ["return", "shop"],
  },
};

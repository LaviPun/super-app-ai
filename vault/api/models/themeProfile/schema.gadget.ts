import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v1",
  storageKey: "DataModel-ThemeProfile",
  fields: {
    themeId: {
      type: "string",
      storageKey: "themeProfile-themeId",
    },
    profileJson: {
      type: "json",
      storageKey: "themeProfile-profileJson",
    },
    shop: {
      type: "belongsTo",
      parent: { model: "shopifyShop" },
      storageKey: "themeProfile-shop",
    },
  },
};

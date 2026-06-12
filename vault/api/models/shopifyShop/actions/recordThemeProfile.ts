import { ActionOptions, ActionRun, assert } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";
import { recordThemeProfile } from "../../../lib/shopify/themeProfiles";

export const params = {
  themeId: { type: "string" },
  profileJson: { type: "object", additionalProperties: true },
};

export const run: ActionRun = async ({ params, record, api }) => {
  await preventCrossShopDataAccess(params, record);

  const themeId = assert(params.themeId, "themeId is required");
  const profileJson = assert(params.profileJson, "profileJson is required");

  return await recordThemeProfile(api, {
    shopId: record.id,
    themeId,
    profileJson,
  });
};

export const options: ActionOptions = {
  actionType: "custom",
  returnType: true,
  triggers: {
    api: true,
  },
};

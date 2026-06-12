import type { GadgetAPI } from "gadget-server";

export const themeProfileSelection = {
  id: true,
  themeId: true,
  profileJson: true,
  shopId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type RecordThemeProfileParams = {
  shopId: string;
  themeId: string;
  profileJson: Record<string, unknown>;
};

export type ThemeProfileRecord = {
  id: string;
  themeId: string;
  profileJson: Record<string, unknown>;
  shopId: string;
  createdAt: Date;
  updatedAt: Date;
};

const upsertThemeProfileByShopAndTheme = async (
  api: GadgetAPI,
  params: RecordThemeProfileParams
): Promise<ThemeProfileRecord> => {
  const existing = await api.themeProfile.findFirst({
    filter: {
      AND: [
        { shopId: { equals: params.shopId } },
        { themeId: { equals: params.themeId } },
      ],
    },
    select: themeProfileSelection,
  });

  if (existing) {
    return (await api.themeProfile.update(
      existing.id,
      {
        profileJson: params.profileJson,
      },
      { select: themeProfileSelection }
    )) as ThemeProfileRecord;
  }

  return (await api.themeProfile.create(
    {
      shop: { _link: params.shopId },
      themeId: params.themeId,
      profileJson: params.profileJson,
    },
    { select: themeProfileSelection }
  )) as ThemeProfileRecord;
};

export const recordThemeProfile = async (
  api: GadgetAPI,
  params: RecordThemeProfileParams
): Promise<ThemeProfileRecord> => {
  return await upsertThemeProfileByShopAndTheme(api, params);
};

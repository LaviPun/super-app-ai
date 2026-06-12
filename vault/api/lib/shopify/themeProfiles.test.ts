import { describe, expect, it, vi } from "vitest";

import { recordThemeProfile } from "./themeProfiles";

describe("themeProfiles", () => {
  it("updates an existing profile for the same shop and theme", async () => {
    const updated = {
      id: "tp_1",
      shopId: "shop_1",
      themeId: "theme_1",
      profileJson: { fonts: ["Inter"] },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-12T00:00:00.000Z"),
    };

    const api = {
      themeProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: "tp_1" }),
        update: vi.fn().mockResolvedValue(updated),
        create: vi.fn(),
      },
    };

    const result = await recordThemeProfile(api as never, {
      shopId: "shop_1",
      themeId: "theme_1",
      profileJson: { fonts: ["Inter"] },
    });

    expect(result).toEqual(updated);
    expect(api.themeProfile.update).toHaveBeenCalledWith(
      "tp_1",
      { profileJson: { fonts: ["Inter"] } },
      { select: expect.any(Object) }
    );
    expect(api.themeProfile.create).not.toHaveBeenCalled();
  });

  it("creates a profile when none exists for the shop and theme", async () => {
    const created = {
      id: "tp_2",
      shopId: "shop_1",
      themeId: "theme_2",
      profileJson: { colors: ["#000"] },
      createdAt: new Date("2026-06-12T00:00:00.000Z"),
      updatedAt: new Date("2026-06-12T00:00:00.000Z"),
    };

    const api = {
      themeProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue(created),
      },
    };

    const result = await recordThemeProfile(api as never, {
      shopId: "shop_1",
      themeId: "theme_2",
      profileJson: { colors: ["#000"] },
    });

    expect(result).toEqual(created);
    expect(api.themeProfile.create).toHaveBeenCalledWith(
      {
        shop: { _link: "shop_1" },
        themeId: "theme_2",
        profileJson: { colors: ["#000"] },
      },
      { select: expect.any(Object) }
    );
  });
});

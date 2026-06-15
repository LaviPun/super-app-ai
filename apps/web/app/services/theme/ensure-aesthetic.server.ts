import type { AdminApiContext } from '~/types/shopify';
import { getPrisma } from '~/db.server';
import { ThemeService } from '~/services/shopify/theme.service';
import { ThemeAnalyzerService, type ThemeProfileResult } from '~/services/theme/theme-analyzer.service';

const FRESH_MS = 7 * 24 * 60 * 60 * 1000; // re-analyze the live theme at most weekly
const DEFAULT_MAX_WAIT_MS = 7000; // stay well within the create-module time budget

/**
 * Best-effort: make sure the merchant's LIVE theme has a recent aesthetic
 * profile (palette + typography) persisted, so storefront generation can match
 * the store's real colors. Never throws — generation proceeds regardless, and a
 * profile that finishes here is reused on subsequent calls.
 */
export async function ensureStoreAesthetic(opts: {
  admin: AdminApiContext['admin'];
  shopId: string;
  maxWaitMs?: number;
}): Promise<void> {
  const { admin, shopId } = opts;
  try {
    const themes = await new ThemeService(admin).listThemes();
    const main = themes.find((t) => t.role === 'main') ?? themes[0];
    if (!main) return;
    const themeId = String(main.id);

    const prisma = getPrisma();
    const existing = await prisma.themeProfile.findUnique({
      where: { shopId_themeId: { shopId, themeId } },
    });

    if (existing) {
      const fresh = Date.now() - new Date(existing.updatedAt).getTime() < FRESH_MS;
      let hasPalette = false;
      try {
        const profile = JSON.parse(existing.profileJson) as ThemeProfileResult;
        hasPalette = !!profile.palette && profile.palette.source !== 'none';
      } catch {
        hasPalette = false;
      }
      if (fresh && hasPalette) return;
    }

    const analyzer = new ThemeAnalyzerService(admin);
    await Promise.race([
      analyzer.analyzeAndStore(shopId, themeId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('theme-analyze timeout')), opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS),
      ),
    ]);
  } catch {
    // Best-effort only — fall back to URL/default design reference.
  }
}

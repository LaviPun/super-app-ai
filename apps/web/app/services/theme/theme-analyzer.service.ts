import type { AdminApiContext } from '~/types/shopify';
import { getPrisma } from '~/db.server';

/** Read specific theme files by name (Admin API 2026-04+; replaces REST assets.json). */
const THEME_FILES_QUERY = `#graphql
  query ThemeFiles($themeId: ID!, $filenames: [String!]!) {
    theme(id: $themeId) {
      files(filenames: $filenames) {
        nodes {
          filename
          body {
            ... on OnlineStoreThemeFileBodyText { content }
          }
        }
        userErrors { code filename }
      }
    }
  }
`;

type ThemeFilesResponse = {
  data?: {
    theme?: {
      files?: {
        nodes?: Array<{ filename?: string; body?: { content?: string } }>;
      };
    };
  };
};

/** Extracted brand colors from the merchant's live theme. */
export type StorePalette = {
  /** Dominant brand/accent color (CTA, links). */
  primary?: string;
  /** Secondary accent if distinguishable from primary. */
  accent?: string;
  /** Page/section background. */
  background?: string;
  /** Body text color. */
  text?: string;
  /** Button background. */
  button?: string;
  /** Button label color. */
  buttonText?: string;
  /** Distinct colors seen across the theme, most frequent first. */
  neutrals: string[];
  /** Where the palette came from (for prompt provenance + debugging). */
  source: 'settings_data' | 'css' | 'none';
};

/** Extracted typography hints from the merchant's live theme. */
export type StoreTypography = {
  headingFont?: string;
  bodyFont?: string;
};

export type ThemeProfileResult = {
  themeId: string;
  detected: {
    cartDrawer: boolean;
    predictiveSearch: boolean;
    productForm: boolean;
    miniCart: boolean;
  };
  hints: {
    cartDrawerSelector?: string;
    addToCartFormSelector?: string;
    searchInputSelector?: string;
  };
  surfaces: Record<string, { mountStrategy: 'APP_BLOCK'|'THEME_PATCH'; notes?: string }>;
  /** Live store aesthetic — drives AI section color/typography matching. */
  palette: StorePalette;
  typography: StoreTypography;
};

export class ThemeAnalyzerService {
  constructor(private readonly admin: AdminApiContext['admin']) {}

  async analyzeAndStore(shopId: string, themeId: string): Promise<ThemeProfileResult> {
    const assets = await this.fetchKeyAssets(themeId);
    const profile = this.analyzeAssets(themeId, assets);

    const prisma = getPrisma();
    await prisma.themeProfile.upsert({
      where: { shopId_themeId: { shopId, themeId } },
      create: { shopId, themeId, profileJson: JSON.stringify(profile) },
      update: { profileJson: JSON.stringify(profile) },
    });

    return profile;
  }

  private async fetchKeyAssets(themeId: string): Promise<Record<string, string>> {
    const keys = [
      'layout/theme.liquid',
      'sections/header.liquid',
      'sections/cart-drawer.liquid',
      'sections/main-product.liquid',
      'sections/predictive-search.liquid',
      'snippets/cart-drawer.liquid',
      'snippets/buy-buttons.liquid',
      'snippets/product-form.liquid',
      'assets/base.css',
      // Aesthetic sources — theme color schemes + global type settings.
      'config/settings_data.json',
      'config/settings_schema.json',
    ];

    // GraphQL themeFiles (Admin API 2026-04+); REST assets.json is deprecated.
    const themeGid = themeId.startsWith('gid://') ? themeId : `gid://shopify/OnlineStoreTheme/${themeId}`;
    const out: Record<string, string> = {};
    try {
      const res = await this.admin.graphql(THEME_FILES_QUERY, {
        variables: { themeId: themeGid, filenames: keys },
      });
      const json = (await res.json()) as ThemeFilesResponse;
      const nodes = json?.data?.theme?.files?.nodes ?? [];
      for (const node of nodes) {
        const content = node?.body?.content;
        if (node?.filename && typeof content === 'string') out[node.filename] = content;
      }
    } catch {
      // ignore — analysis degrades gracefully (palette source 'none').
    }
    return out;
  }

  private analyzeAssets(themeId: string, assets: Record<string, string>): ThemeProfileResult {
    const joined = Object.values(assets).join('\n');
    const cartDrawer = hasAny(joined, ['cart-drawer', 'CartDrawer', 'data-cart-drawer', 'cart__drawer']);
    const predictiveSearch = hasAny(joined, ['predictive-search', 'PredictiveSearch', 'data-predictive-search']);
    const productForm = hasAny(joined, ['product-form', 'ProductForm', 'product-form__submit', 'add-to-cart']);
    const miniCart = cartDrawer || hasAny(joined, ['mini-cart', 'minicart', 'cart-notification']);

    const hints: ThemeProfileResult['hints'] = {};
    if (cartDrawer) hints.cartDrawerSelector = '[data-cart-drawer], cart-drawer, .cart-drawer';
    if (productForm) hints.addToCartFormSelector = 'form[action*="/cart/add"], product-form form';
    if (predictiveSearch) hints.searchInputSelector = 'predictive-search input[type="search"], form[action*="/search"] input';

    const surfaces: ThemeProfileResult['surfaces'] = {
      product: { mountStrategy: 'APP_BLOCK', notes: 'Prefer app blocks near product form.' },
      collection: { mountStrategy: 'APP_BLOCK' },
      cart: { mountStrategy: cartDrawer ? 'APP_BLOCK' : 'THEME_PATCH', notes: cartDrawer ? 'Cart drawer detected.' : 'No cart drawer detected; patch carefully.' },
      header: { mountStrategy: 'APP_BLOCK', notes: 'Use theme app embed for header notifications.' },
      footer: { mountStrategy: 'APP_BLOCK' },
    };

    const palette = extractPalette(assets['config/settings_data.json'], assets['assets/base.css']);
    const typography = extractTypography(assets['config/settings_data.json']);

    return { themeId, detected: { cartDrawer, predictiveSearch, productForm, miniCart }, hints, surfaces, palette, typography };
  }
}

function hasAny(haystack: string, needles: string[]) {
  const h = haystack.toLowerCase();
  return needles.some(n => h.includes(n.toLowerCase()));
}

// ─── Aesthetic extraction ──────────────────────────────────────────────────

/** Normalize a value to a `#rrggbb` hex string, or null if not a usable color. */
function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim().toLowerCase();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  const hex = m?.[1];
  if (!hex) return null;
  if (hex.length === 3) {
    const [r, g, b] = hex.split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${hex}`;
}

const NEAR_WHITE = new Set(['#ffffff', '#fefefe', '#fcfcfc', '#fafafa']);
const NEAR_BLACK = new Set(['#000000', '#010101', '#0a0a0a', '#111111', '#121212']);

/** Relative luminance (0=black, 1=white) of a normalized `#rrggbb` hex. */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function isDark(hex: string): boolean {
  return luminance(hex) < 0.25;
}
function isLight(hex: string): boolean {
  return luminance(hex) > 0.85;
}

/** Recursively collect [key, hex] pairs from a parsed settings object. */
function collectHexPairs(node: unknown, keyHint: string, out: Array<{ key: string; hex: string }>): void {
  if (node == null) return;
  if (typeof node === 'string') {
    const hex = normalizeHex(node);
    if (hex) out.push({ key: keyHint.toLowerCase(), hex });
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectHexPairs(item, keyHint, out);
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      collectHexPairs(v, k, out);
    }
  }
}

/** Resolve the active settings object from settings_data.json (`current` may be a preset name). */
function resolveCurrentSettings(parsed: Record<string, unknown>): unknown {
  const current = parsed.current;
  if (current && typeof current === 'object') return current;
  if (typeof current === 'string') {
    const presets = parsed.presets;
    if (presets && typeof presets === 'object') {
      const preset = (presets as Record<string, unknown>)[current];
      if (preset) return preset;
    }
  }
  return parsed;
}

function pickByKey(pairs: Array<{ key: string; hex: string }>, re: RegExp): string | undefined {
  return pairs.find((p) => re.test(p.key))?.hex;
}

/**
 * Extract a brand palette from the theme's color schemes (settings_data.json),
 * falling back to frequency analysis of hex literals in base.css.
 */
export function extractPalette(settingsDataJson?: string, baseCss?: string): StorePalette {
  // 1) Preferred source: theme color schemes / global color settings.
  if (settingsDataJson) {
    try {
      const parsed = JSON.parse(settingsDataJson) as Record<string, unknown>;
      const settings = resolveCurrentSettings(parsed);
      const pairs: Array<{ key: string; hex: string }> = [];
      collectHexPairs(settings, 'root', pairs);

      if (pairs.length > 0) {
        const background = pickByKey(pairs, /background/) ?? pickByKey(pairs, /^bg/);
        const text = pickByKey(pairs, /text|foreground|body/);
        const buttonText = pickByKey(pairs, /button.*label|button.*text|on[_-]?button|solid_button_label/);
        const button = pickByKey(pairs, /(^|_)button(_background)?$|button_1|solid_button|primary_button/);
        const accentLike = pairs.filter((p) => /accent|primary|brand|button|link|highlight/.test(p.key));
        const primary =
          accentLike.map((p) => p.hex).find((h) => !NEAR_WHITE.has(h) && !NEAR_BLACK.has(h)) ??
          button ??
          accentLike[0]?.hex;
        const accent = accentLike.map((p) => p.hex).find((h) => h !== primary && !NEAR_WHITE.has(h));

        const neutrals = rankByFrequency(pairs.map((p) => p.hex));
        return { primary, accent, background, text, button, buttonText, neutrals, source: 'settings_data' };
      }
    } catch {
      // fall through to CSS analysis
    }
  }

  // 2) Fallback: frequency analysis of hexes (incl. --color custom props) in base.css.
  if (baseCss) {
    const hexes: string[] = [];
    for (const m of baseCss.matchAll(/#[0-9a-fA-F]{3,6}\b/g)) {
      const hex = normalizeHex(m[0]);
      if (hex) hexes.push(hex);
    }
    if (hexes.length > 0) {
      const ranked = rankByFrequency(hexes);
      const background = ranked.find(isLight) ?? ranked.find((h) => NEAR_WHITE.has(h)) ?? ranked[0];
      const text = ranked.find(isDark);
      const primary = ranked.find((h) => !isDark(h) && !isLight(h));
      return { primary, background, text, neutrals: ranked, source: 'css' };
    }
  }

  return { neutrals: [], source: 'none' };
}

/** Distinct hexes ordered by frequency (most common first). */
function rankByFrequency(hexes: string[]): string[] {
  const counts = new Map<string, number>();
  for (const h of hexes) counts.set(h, (counts.get(h) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, 8);
}

/** Pull heading/body font family hints from global type settings. */
export function extractTypography(settingsDataJson?: string): StoreTypography {
  if (!settingsDataJson) return {};
  try {
    const parsed = JSON.parse(settingsDataJson) as Record<string, unknown>;
    const settings = resolveCurrentSettings(parsed);
    if (!settings || typeof settings !== 'object') return {};
    const flat = settings as Record<string, unknown>;
    const out: StoreTypography = {};
    for (const [k, v] of Object.entries(flat)) {
      if (typeof v !== 'string') continue;
      const key = k.toLowerCase();
      if (!out.headingFont && /(type_)?(header|heading)_font/.test(key)) out.headingFont = humanizeFont(v);
      if (!out.bodyFont && /(type_)?(body|base)_font/.test(key)) out.bodyFont = humanizeFont(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** Shopify stores fonts as handles like "assistant_n4"; surface the family name. */
function humanizeFont(handle: string): string {
  const family = handle.split('_')[0]?.replace(/-/g, ' ').trim();
  if (!family) return handle;
  return family.charAt(0).toUpperCase() + family.slice(1);
}

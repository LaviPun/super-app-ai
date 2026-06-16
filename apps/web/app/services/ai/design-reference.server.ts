import { SettingsService } from '~/services/settings/settings.service';
import { getPrisma } from '~/db.server';
import type { StorePalette, StoreTypography, ThemeProfileResult } from '~/services/theme/theme-analyzer.service';
import {
  buildDesignSystemDirective,
  computeAestheticSignalsFromColors,
  isHexColor,
  selectPack,
  type PackSelection,
} from '~/services/ai/style-packs.server';

export interface DesignReferencePack {
  sourceUrl: string;
  sourceType: 'store' | 'fallback';
  brandTone: string;
  primaryColors: string[];
  neutralPalette: string[];
  typographyHints: string[];
  componentStyleHints: string[];
  uxPrinciples: string[];
}

const FALLBACK_DESIGN_REFERENCE_URL = 'https://bummer.in';

function toSafeUrl(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function deriveDesignReferencePack(referenceUrl?: string | null): DesignReferencePack {
  const normalized = toSafeUrl(referenceUrl) ?? FALLBACK_DESIGN_REFERENCE_URL;
  const host = new URL(normalized).hostname.toLowerCase();
  const fallback = host === 'bummer.in' || host.endsWith('.bummer.in');

  if (fallback) {
    return {
      sourceUrl: normalized,
      sourceType: 'fallback',
      brandTone: 'premium-minimal, editorial, high-contrast with restrained accents',
      primaryColors: ['#111827', '#F97316', '#F8FAFC'],
      neutralPalette: ['#0F172A', '#1F2937', '#64748B', '#E2E8F0', '#FFFFFF'],
      typographyHints: [
        'Use modern geometric sans aesthetic with strong heading weight and clean body text.',
        'Favor larger heading scale with compact line-height and high readability.',
      ],
      componentStyleHints: [
        'Rounded-medium corners, subtle soft shadows, crisp border contrast.',
        'Primary CTA must be visually dominant; secondary action should be low-emphasis text/button.',
      ],
      uxPrinciples: [
        'Premium hierarchy: one clear focal message and one primary CTA.',
        'Reduce clutter and avoid noisy ornamentation.',
        'Motion should be subtle and purposeful; respect reduced-motion defaults.',
      ],
    };
  }

  return {
    sourceUrl: normalized,
    sourceType: 'store',
    brandTone: 'brand-aligned premium ecommerce with polished, conversion-focused UI',
    primaryColors: ['Use source brand primary/accent colors from reference URL'],
    neutralPalette: ['Use source neutral palette for backgrounds, text, and borders'],
    typographyHints: [
      'Match source brand typography mood (heading emphasis + readable body).',
      'Preserve consistent size rhythm between title, supporting copy, and CTA.',
    ],
    componentStyleHints: [
      'Mirror source CTA styling pattern (shape, color contrast, hover emphasis).',
      'Keep spacing rhythm and radius scale consistent with source brand feel.',
    ],
    uxPrinciples: [
      'Deliver a premium first-impression with clear hierarchy and conversion intent.',
      'Preserve accessibility and legibility while matching brand style direction.',
    ],
  };
}

export function buildDesignReferencePromptBlock(pack: DesignReferencePack): string {
  let promptSource = pack.sourceUrl;
  try {
    const parsed = new URL(pack.sourceUrl);
    promptSource = parsed.origin;
  } catch {
    promptSource = pack.sourceUrl;
  }
  if (promptSource.length > 120) {
    promptSource = `${promptSource.slice(0, 117)}...`;
  }
  return [
    `DesignReferenceV1 (source: ${pack.sourceType}, url: ${promptSource})`,
    `BrandTone: ${pack.brandTone}`,
    `PrimaryColors: ${pack.primaryColors.join(', ')}`,
    `NeutralPalette: ${pack.neutralPalette.join(', ')}`,
    `TypographyHints: ${pack.typographyHints.join(' | ')}`,
    `ComponentStyleHints: ${pack.componentStyleHints.join(' | ')}`,
    `UXPrinciples: ${pack.uxPrinciples.join(' | ')}`,
  ].join('\n');
}

export async function resolveDesignReferencePack(): Promise<DesignReferencePack> {
  const settings = await new SettingsService().get();
  return deriveDesignReferencePack(settings.designReferenceUrl);
}

/**
 * Pick the style pack (Design System Bible §B) implied by a design reference
 * pack's colors + typography. Returns the full selection (pack id, confidence,
 * alternatives) so callers can surface a picker on low confidence.
 */
export function selectStylePackForReference(pack: DesignReferencePack): PackSelection {
  const headingHint = pack.typographyHints.find((h) => /head/i.test(h)) ?? pack.typographyHints[0];
  const signals = computeAestheticSignalsFromColors(
    pack.primaryColors,
    pack.neutralPalette,
    headingHint,
  );
  return selectPack(signals);
}

/**
 * Build the design-system directive injected into the generation prompt: the
 * Apple-HIG floor + the selected style pack's grammar + mobile-first + mandatory
 * micro-interactions + self-audit. Brand hexes (when concrete) are restated so
 * the model uses the store's real colors.
 */
export function buildDesignSystemDirectiveForReference(pack: DesignReferencePack): string {
  const selection = selectStylePackForReference(pack);
  const brandColors = [...pack.primaryColors, ...pack.neutralPalette].filter(isHexColor);
  return buildDesignSystemDirective({ selection, brandColors, fontHints: pack.typographyHints });
}

/**
 * Build a DesignReferencePack from a palette extracted off the merchant's LIVE
 * theme (ThemeAnalyzerService). Unlike the URL-based `store` pack, this carries
 * concrete hex values so generated sections actually match the storefront.
 */
export function paletteToDesignReferencePack(
  palette: StorePalette,
  typography: StoreTypography,
  sourceUrl: string,
): DesignReferencePack {
  const primary = unique(
    [palette.primary, palette.accent, palette.button].filter((c): c is string => !!c),
  );
  const neutral = unique(
    [palette.background, palette.text, ...palette.neutrals].filter((c): c is string => !!c),
  );
  const typographyHints: string[] = [];
  if (typography.headingFont) typographyHints.push(`Match heading font feel: ${typography.headingFont}.`);
  if (typography.bodyFont) typographyHints.push(`Match body font feel: ${typography.bodyFont}.`);
  if (typographyHints.length === 0) {
    typographyHints.push('Match the live store typography mood (heading emphasis + readable body).');
  }

  return {
    sourceUrl,
    sourceType: 'store',
    brandTone: 'extracted from the live store theme — match its existing color and type system exactly',
    primaryColors: primary.length > 0 ? primary : ['Use the live store brand/accent colors'],
    neutralPalette: neutral.length > 0 ? neutral : ['Use the live store neutral palette'],
    typographyHints,
    componentStyleHints: [
      'Reuse the store palette for background, text, and CTA so the section looks native.',
      'Keep CTA color contrast and radius consistent with the live theme.',
    ],
    uxPrinciples: [
      'The section must feel like it ships with the theme, not bolted on.',
      'Preserve accessibility and legibility while matching the extracted palette.',
    ],
  };
}

/** Latest persisted theme aesthetic for a shop (most recently analyzed theme). */
export async function loadStoreAesthetic(
  shopId: string,
  themeId?: string,
): Promise<{ palette: StorePalette; typography: StoreTypography } | null> {
  const prisma = getPrisma();
  const row = themeId
    ? await prisma.themeProfile.findUnique({ where: { shopId_themeId: { shopId, themeId } } })
    : await prisma.themeProfile.findFirst({ where: { shopId }, orderBy: { updatedAt: 'desc' } });
  if (!row) return null;
  try {
    const profile = JSON.parse(row.profileJson) as ThemeProfileResult;
    if (!profile.palette || profile.palette.source === 'none') return null;
    return { palette: profile.palette, typography: profile.typography ?? {} };
  } catch {
    return null;
  }
}

/** Like `loadStoreAesthetic` but resolves the internal shopId from a shop domain. */
export async function loadStoreAestheticByDomain(
  shopDomain: string,
  themeId?: string,
): Promise<{ palette: StorePalette; typography: StoreTypography } | null> {
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain }, select: { id: true } });
  if (!shop) return null;
  return loadStoreAesthetic(shop.id, themeId);
}

/**
 * Resolve the best design reference for storefront generation: prefer the live
 * theme palette (concrete hexes), else fall back to the settings URL / default.
 */
export async function resolveStoreDesignReferencePack(
  shopId: string,
  options: { themeId?: string; storeUrl?: string } = {},
): Promise<DesignReferencePack> {
  const aesthetic = await loadStoreAesthetic(shopId, options.themeId);
  if (aesthetic) {
    return paletteToDesignReferencePack(aesthetic.palette, aesthetic.typography, options.storeUrl ?? 'live-theme');
  }
  return resolveDesignReferencePack();
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}


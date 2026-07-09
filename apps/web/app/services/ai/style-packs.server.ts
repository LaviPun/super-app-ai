/**
 * Style-pack framework (Design System Bible §B).
 *
 * A style pack is a TOKEN GRAMMAR (type scale, radius, shadow, density, motion
 * personality, accent strategy, imagery direction) applied ON TOP of the
 * merchant's extracted brand colors/fonts. Packs supply grammar; the live
 * `StorePalette`/`StoreTypography` supply the brand content. Every pack still
 * satisfies the Apple-HIG floor (see `buildDesignSystemDirective`).
 *
 * Pure + DB-free so it can run inside the generation pipeline and in tests.
 * Source of truth for the numbers: docs/design-system/research-dossier.md §A,§B,§E,§F.
 */
import type { StorePalette, StoreTypography } from '~/services/theme/theme-analyzer.service';

export type StylePackId =
  | 'apple-hig-clean'
  | 'editorial-wellness'
  | 'bold-dtc'
  | 'minimal-luxe'
  | 'playful-commerce'
  | 'tech-utility';

export type StylePack = {
  id: StylePackId;
  name: string;
  /** One-line personality used in the prompt. */
  personality: string;
  typePairing: string;
  density: 'airy' | 'comfortable' | 'compact';
  radius: { sm: number; md: number; lg: number; pill: number };
  shadow: { rest: string; raised: string };
  motion: { personality: string; springs: boolean };
  accentStrategy: string;
  imageryRule: string;
};

export type FontClass =
  | 'serif'
  | 'geom-sans'
  | 'humanist-sans'
  | 'rounded-sans'
  | 'grotesk'
  | 'mono'
  | 'display'
  | 'unknown';

export type AestheticSignals = {
  /** 0 (black) .. 1 (white) relative luminance of the store background. */
  bgLuminance: number;
  /** 0..1 HSL saturation of the dominant accent. */
  accentSaturation: number;
  accentHueFamily: 'warm' | 'cool' | 'neutral';
  /** Count of distinct usable (hex) colors detected. */
  paletteSpread: number;
  fontClass: FontClass;
  /** False when extraction produced no real hex colors (placeholders / source 'none'). */
  hasUsableColors: boolean;
};

export type PackSelection = {
  packId: StylePackId;
  /** 0..1 — gap between the top pack and the runner-up. Low ⇒ surface a picker. */
  confidence: number;
  alternatives: StylePackId[];
  reason: string;
};

// ---------------------------------------------------------------------------
// Pack definitions (dossier §B1/§B2). Colors/fonts come from extraction, NOT here.
// ---------------------------------------------------------------------------

export const STYLE_PACKS: Record<StylePackId, StylePack> = {
  'apple-hig-clean': {
    id: 'apple-hig-clean',
    name: 'Apple HIG Clean',
    personality: 'system-like, neutral, content-first, generous negative space',
    typePairing: 'one geometric/system sans, hierarchy by weight not by new fonts',
    density: 'comfortable',
    radius: { sm: 8, md: 12, lg: 16, pill: 9999 },
    shadow: { rest: '0 1px 2px rgba(0,0,0,0.06)', raised: '0 6px 16px rgba(0,0,0,0.10)' },
    motion: { personality: 'minimal-functional, system-like', springs: false },
    accentStrategy: 'one accent, used sparingly — filled primary CTA only',
    imageryRule: 'clean product on a neutral ground, lots of negative space, no busy backgrounds',
  },
  'editorial-wellness': {
    id: 'editorial-wellness',
    name: 'Editorial Wellness',
    personality: 'warm, editorial, human, airy (hims/forhers register)',
    typePairing: 'serif display + humanist sans body',
    density: 'airy',
    radius: { sm: 12, md: 16, lg: 24, pill: 9999 },
    shadow: { rest: '0 1px 2px rgba(43,43,43,0.04)', raised: '0 8px 28px rgba(43,43,43,0.08)' },
    motion: { personality: 'calm, slow, gentle fades', springs: false },
    accentStrategy: 'warm accent as large tinted fields + pill buttons',
    imageryRule: 'warm, film-grade, unretouched lifestyle of a real person; soft natural light; lots of surrounding space',
  },
  'bold-dtc': {
    id: 'bold-dtc',
    name: 'Bold DTC',
    personality: 'loud, high-contrast, confident',
    typePairing: 'heavy grotesk display + neutral sans body',
    density: 'compact',
    radius: { sm: 6, md: 10, lg: 12, pill: 9999 },
    shadow: { rest: 'none', raised: '6px 6px 0 rgba(0,0,0,0.9)' },
    motion: { personality: 'snappy, confident, slight overshoot', springs: true },
    accentStrategy: 'saturated accent used boldly; large filled CTAs',
    imageryRule: 'high-contrast hero, bold crops, big type-on-image',
  },
  'minimal-luxe': {
    id: 'minimal-luxe',
    name: 'Minimal Luxe',
    personality: 'sparse, precise, premium',
    typePairing: 'high-contrast serif or thin display + refined sans',
    density: 'airy',
    radius: { sm: 0, md: 4, lg: 4, pill: 9999 },
    shadow: { rest: 'none', raised: '0 0 0 1px rgba(0,0,0,0.08)' },
    motion: { personality: 'restrained, elegant, long fades', springs: false },
    accentStrategy: 'monochrome + one deep/metallic accent; hairline rules',
    imageryRule: 'B&W or muted, generous margin, a single focal image',
  },
  'playful-commerce': {
    id: 'playful-commerce',
    name: 'Playful Commerce',
    personality: 'bright, friendly, energetic',
    typePairing: 'rounded sans display + rounded sans body',
    density: 'comfortable',
    radius: { sm: 12, md: 16, lg: 24, pill: 9999 },
    shadow: { rest: '0 2px 8px rgba(0,0,0,0.08)', raised: '0 10px 24px rgba(0,0,0,0.14)' },
    motion: { personality: 'bouncy springs, confetti on big wins', springs: true },
    accentStrategy: 'multi-accent, gradients, colorful chips',
    imageryRule: 'bright illustration, stickers, gradients, friendly imagery',
  },
  'tech-utility': {
    id: 'tech-utility',
    name: 'Tech Utility',
    personality: 'cool, gridded, data-dense, precise',
    typePairing: 'geometric/neo-grotesk sans + mono for numerals/data',
    density: 'compact',
    radius: { sm: 6, md: 8, lg: 10, pill: 9999 },
    shadow: { rest: '0 0 0 1px rgba(0,0,0,0.08)', raised: '0 2px 6px rgba(0,0,0,0.10)' },
    motion: { personality: 'fast micro-only (80–150ms)', springs: false },
    accentStrategy: 'cool accent, monochrome neutrals, mono numerals',
    imageryRule: 'screenshot/diagram/schematic, mono labels',
  },
};

export const DEFAULT_PACK_ID: StylePackId = 'apple-hig-clean';

// ---------------------------------------------------------------------------
// Two-pack render grammar (module-design-system.md §3.3 / §9.2)
// ---------------------------------------------------------------------------

/** The storefront render packs — the two values of the runtime `--sa-*` token map. */
export type StorefrontPack = 'luxe' | 'bold';

/** The loud/saturated aesthetic packs collapse to Bold DTC; everything else to Minimal Luxe. */
const BOLD_STOREFRONT_PACKS: readonly StylePackId[] = ['bold-dtc', 'playful-commerce'];

/**
 * Collapse the six aesthetic-selection packs to the two storefront render packs
 * (module-design-system.md §9.2). `bold ← {bold-dtc, playful-commerce}`,
 * `luxe ← {apple-hig-clean, editorial-wellness, minimal-luxe, tech-utility}`.
 * Bias to Luxe (the "can't-look-wrong" pack) on low confidence — never ship the
 * louder Bold grammar on weak aesthetic evidence.
 */
export function resolveStorefrontPack(selection: PackSelection): StorefrontPack {
  if (selection.confidence < 0.34) return 'luxe';
  return BOLD_STOREFRONT_PACKS.includes(selection.packId) ? 'bold' : 'luxe';
}

// ---------------------------------------------------------------------------
// Color math (WCAG / HSL)
// ---------------------------------------------------------------------------

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

export function isHexColor(s: unknown): s is string {
  return typeof s === 'string' && HEX_RE.test(s.trim());
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** WCAG relative luminance (0..1). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function rgbToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hueFamily(h: number, s: number): 'warm' | 'cool' | 'neutral' {
  if (s < 0.15) return 'neutral';
  // warm: reds/oranges/yellows (~ -30..90 and 330..360); cool: greens/blues/violet
  if ((h >= 330 || h <= 90)) return 'warm';
  return 'cool';
}

// ---------------------------------------------------------------------------
// Font classification (dossier §B0 fontClass)
// ---------------------------------------------------------------------------

export function classifyFont(hint?: string | null): FontClass {
  if (!hint) return 'unknown';
  const f = hint.toLowerCase();
  if (/(mono|consol|courier|code|menlo|roboto mono|ibm plex mono)/.test(f)) return 'mono';
  if (/(serif|playfair|georgia|times|garamond|merriweather|lora|cormorant|freight|canela|tiempos|slab)/.test(f)) return 'serif';
  if (/(nunito|quicksand|baloo|fredoka|comfortaa|rounded|varela|dm sans rounded|poppins)/.test(f)) return 'rounded-sans';
  if (/(archivo|druk|anton|grotesk|grotesque|bebas|oswald|haas|neue montreal|sohne|söhne)/.test(f)) return 'grotesk';
  if (/(inter|helvetica|sf pro|-apple-system|system-ui|geist|general sans|satoshi|circular|gilroy|futura|montserrat|geometric)/.test(f)) return 'geom-sans';
  if (/(open sans|lato|source sans|work sans|instrument sans|pt sans|noto sans|segoe|humanist)/.test(f)) return 'humanist-sans';
  if (/(display|script|hand|brush|decor)/.test(f)) return 'display';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Aesthetic signal extraction
// ---------------------------------------------------------------------------

/** Build signals from raw color arrays + an optional heading-font hint. */
export function computeAestheticSignalsFromColors(
  accents: Array<string | undefined | null>,
  neutrals: Array<string | undefined | null>,
  headingFontHint?: string | null,
  background?: string | null,
): AestheticSignals {
  const accentHexes = accents.filter(isHexColor);
  const neutralHexes = neutrals.filter(isHexColor);
  const allHexes = [...new Set([...accentHexes, ...neutralHexes])];
  const hasUsableColors = allHexes.length > 0;

  const bg = isHexColor(background)
    ? background
    : // brightest neutral approximates the page background
      [...neutralHexes].sort((a, b) => relativeLuminance(b) - relativeLuminance(a))[0];
  const bgLuminance = isHexColor(bg) ? relativeLuminance(bg) : 1;

  // Representative accent = the most saturated non-neutral color (a dark base or
  // off-white is often listed first but isn't the brand accent). Fall back to
  // the first accent hex, then any hex.
  const NEUTRAL_L = 0.12; // treat near-black/near-white as non-accent
  const accent =
    [...accentHexes]
      .map((hex) => ({ hex, hsl: rgbToHsl(hex) }))
      .filter(({ hsl }) => hsl.l > NEUTRAL_L && hsl.l < 1 - NEUTRAL_L)
      .sort((a, b) => b.hsl.s - a.hsl.s)[0]?.hex ?? accentHexes[0] ?? allHexes[0];
  const hsl = isHexColor(accent) ? rgbToHsl(accent) : { h: 0, s: 0, l: 0 };

  return {
    bgLuminance,
    accentSaturation: hsl.s,
    accentHueFamily: isHexColor(accent) ? hueFamily(hsl.h, hsl.s) : 'neutral',
    paletteSpread: allHexes.length,
    fontClass: classifyFont(headingFontHint),
    hasUsableColors,
  };
}

export function computeAestheticSignals(
  palette: StorePalette,
  typography: StoreTypography,
): AestheticSignals {
  return computeAestheticSignalsFromColors(
    [palette.primary, palette.accent, palette.button],
    [palette.background, palette.text, ...(palette.neutrals ?? [])],
    typography.headingFont,
    palette.background,
  );
}

// ---------------------------------------------------------------------------
// Pack selection (dossier §B3 heuristics)
// ---------------------------------------------------------------------------

/**
 * Score each pack against the signals and pick the highest. Falls back to the
 * default pack (Apple HIG Clean) when extraction failed or confidence is low —
 * never silently picking a personality-heavy pack on weak evidence (§B3).
 */
export function selectPack(signals: AestheticSignals): PackSelection {
  if (!signals.hasUsableColors) {
    return {
      packId: DEFAULT_PACK_ID,
      confidence: 0,
      alternatives: ['editorial-wellness'],
      reason: 'No usable brand colors extracted — defaulting to Apple HIG Clean.',
    };
  }

  const { bgLuminance, accentSaturation, accentHueFamily, paletteSpread, fontClass } = signals;
  const isSans = fontClass === 'geom-sans' || fontClass === 'humanist-sans';

  const scores: Record<StylePackId, number> = {
    'apple-hig-clean': 0.5, // neutral baseline so it wins ties / weak signals
    'editorial-wellness': 0,
    'bold-dtc': 0,
    'minimal-luxe': 0,
    'playful-commerce': 0,
    'tech-utility': 0,
  };

  // Apple HIG Clean — neutral/cool, low accent, white-heavy, sans.
  if (accentSaturation < 0.35) scores['apple-hig-clean'] += 0.8;
  if (bgLuminance > 0.85) scores['apple-hig-clean'] += 0.5;
  if (isSans) scores['apple-hig-clean'] += 0.3;

  // Editorial Wellness — warm + serif or warm soft neutrals.
  if (accentHueFamily === 'warm') scores['editorial-wellness'] += 0.9;
  if (fontClass === 'serif') scores['editorial-wellness'] += 0.8;
  if (accentHueFamily === 'warm' && bgLuminance >= 0.8 && bgLuminance <= 0.97 && accentSaturation < 0.7) {
    scores['editorial-wellness'] += 0.6;
  }

  // Bold DTC — loud, saturated accent.
  if (accentSaturation > 0.6) scores['bold-dtc'] += 1.0;
  if (accentSaturation > 0.6 && bgLuminance < 0.5) scores['bold-dtc'] += 0.3;

  // Minimal Luxe — near-monochrome, serif/thin, very low saturation.
  if (paletteSpread <= 3) scores['minimal-luxe'] += 0.6;
  if (accentSaturation < 0.2) scores['minimal-luxe'] += 0.7;
  if (fontClass === 'serif' || fontClass === 'display') scores['minimal-luxe'] += 0.4;

  // Playful Commerce — many saturated colors + rounded.
  if (paletteSpread >= 5 && accentSaturation > 0.5) scores['playful-commerce'] += 0.9;
  if (fontClass === 'rounded-sans') scores['playful-commerce'] += 0.9;

  // Tech Utility — cool accent + geometric/mono.
  if (accentHueFamily === 'cool') scores['tech-utility'] += 0.7;
  if (fontClass === 'geom-sans') scores['tech-utility'] += 0.4;
  if (fontClass === 'mono') scores['tech-utility'] += 0.6;

  const ranked = (Object.keys(scores) as StylePackId[]).sort((a, b) => scores[b] - scores[a]);
  const top: StylePackId = ranked[0] ?? DEFAULT_PACK_ID;
  const second: StylePackId = ranked[1] ?? DEFAULT_PACK_ID;
  const gap = scores[top] - scores[second];
  // Normalize gap to a rough 0..1 confidence (≥0.6 raw gap ⇒ confident).
  const confidence = Math.max(0, Math.min(1, gap / 0.6));

  // Low-confidence guard: never ship a personality-heavy pack on weak evidence.
  const personalityHeavy: StylePackId[] = ['bold-dtc', 'playful-commerce', 'minimal-luxe'];
  if (confidence < 0.34 && personalityHeavy.includes(top)) {
    const safe: StylePackId = signals.accentHueFamily === 'warm' ? 'editorial-wellness' : DEFAULT_PACK_ID;
    return {
      packId: safe,
      confidence,
      alternatives: [top, second].filter((p) => p !== safe),
      reason: `Low confidence (${confidence.toFixed(2)}) for a personality-heavy pack (${top}); defaulting to the safe pack ${safe}.`,
    };
  }

  return {
    packId: top,
    confidence,
    alternatives: ranked.slice(1, 3),
    reason: `Selected ${top} (score ${scores[top].toFixed(2)} vs ${second} ${scores[second].toFixed(2)}).`,
  };
}

// ---------------------------------------------------------------------------
// Prompt directive (the "generation upgrade" — injected into create prompts)
// ---------------------------------------------------------------------------

/**
 * Concrete render-pack grammar (module-design-system.md §3.1 / §3.2). The model
 * emits NAMED StorefrontStyle tokens (never raw px/ms/hex) that resolve to this
 * grammar; the compiler lowers them to the `--sa-*` map. Returned as directive
 * lines so the prompt teaches the exact enum values per pack.
 */
function storefrontPackGrammarLines(pack: StorefrontPack): string[] {
  if (pack === 'bold') {
    return [
      'Render pack: BOLD DTC — heavy grotesk, saturated accent used everywhere, hard offset shadows, snappy overshoot, direct/urgent voice. Emit tokens matching:',
      '  • Density: spacing.density "compact"→"comfortable", padding "medium".',
      '  • Typography: display ALL-CAPS at typography.size "2XL", weight "bold", lineHeight "tight"; oversized numerals.',
      '  • Shape: shape.radius "sm"–"lg"; shape.borderWidth "medium"–"thick" (structural 2px); shape.elevation "glow" (on dark) with a hard offset shadow — accent or ink, no blur.',
      '  • Motion: motion.duration "fast" (~140ms), motion.easing "enter" with overshoot; press = translate + shadow-shrink.',
      '  • CTA: accent fill on ink label, radius "sm", hard offset shadow.',
      '  • Decoration: badge chips, inline ★ proof, accent numerals. Voice: direct, urgent ("Fuel the grind.", "Once it\'s gone, it\'s gone.").',
    ];
  }
  return [
    'Render pack: MINIMAL LUXE — near-monochrome, editorial, hairline detail, long fades, accent used sparingly, quiet/considered voice. Emit tokens matching:',
    '  • Density: spacing.density "airy", padding "loose".',
    '  • Typography: display serif at typography.size "XL"–"2XL", weight "normal"–"medium", lineHeight "relaxed"; labels mono-caps.',
    '  • Shape: shape.radius "none"–"sm"; shape.borderWidth "thin" (hairline); shape.elevation "border" or "emboss" (drop shadow reserved for overlays only).',
    '  • Motion: motion.duration "slow" (~400ms), motion.easing "enter"; hover = subtle translateY lift.',
    '  • CTA: solid ink fill, cream label, squared (radius "none"), mono uppercase.',
    '  • Decoration: serif numerals (01/02/03), mono-caps eyebrows, thin rules. Voice: quiet, considered ("Discover the ritual", "Considered, always").',
  ];
}

/**
 * Build the design-system directive injected into the generation prompt.
 * Teaches the resolved two-pack storefront grammar (Minimal Luxe / Bold DTC,
 * module-design-system.md §3), the named-token grammar (§2, allowed enums only —
 * never raw px/ms/hex), the effects catalog (§6), the mandatory F1–F8
 * micro-interactions (§7), the Apple-HIG floor (§1.4) and mobile-first rules,
 * plus a self-audit so the model corrects itself before returning. Brand
 * colors/fonts (when known) are restated so the model uses the store's values.
 */
export function buildDesignSystemDirective(opts: {
  selection: PackSelection;
  brandColors?: string[];
  fontHints?: string[];
}): string {
  const pack = STYLE_PACKS[opts.selection.packId];
  const renderPack = resolveStorefrontPack(opts.selection);
  const renderPackName = renderPack === 'bold' ? 'Bold DTC' : 'Minimal Luxe';
  const brand = (opts.brandColors ?? []).filter(isHexColor);
  const brandLine = brand.length
    ? `THEME COLORS (use ONLY these — they are extracted from the merchant's live theme): ${brand.join(', ')}. Set style.colors.seed to the merchant accent and flat style.colors (text/background/border/buttonBg/buttonText/overlayBackdrop) from this palette only. Do NOT invent or add off-palette colors.`
    : 'No live store palette was available — set style.colors.seed to a tasteful, on-pack accent and keep style.colors consistent across the module.';
  const feel = opts.fontHints && opts.fontHints.length ? ` Type feel to honor: ${opts.fontHints.join(' | ')}.` : '';
  const fontLine = `THEME FONTS: the module inherits the store theme's fonts automatically via the storefront — do NOT set or override font-family anywhere (not in style, not in any customCss/customHtml). Express hierarchy with typography.size + typography.weight only.${feel}`;
  const effectsLine = renderPack === 'bold'
    ? 'Effects (only for an `effect` module): Bold → loud effects — confetti burst, fireworks, glitter, balloons. Every effect ships a prefers-reduced-motion branch that renders nothing.'
    : 'Effects (only for an `effect` module): Luxe → quiet effects — embers/fireflies, petals, soft snow, shimmer. Every effect ships a prefers-reduced-motion branch that renders nothing.';

  return [
    'DESIGN SYSTEM DIRECTIVE (mandatory — the module must obey this or it will be rejected by the design-QA gate):',
    '',
    `Style pack: ${pack.name} → ${renderPackName} render pack (${pack.personality}).`,
    ...storefrontPackGrammarLines(renderPack),
    opts.selection.confidence < 0.34
      ? '  • (Pack confidence is low — biased to Minimal Luxe, the "can\'t-look-wrong" pack. Stay quiet; avoid loud, personality-heavy choices.)'
      : '',
    '',
    'EMIT NAMED TOKENS ONLY — never a raw px / ms / hex / cubic-bezier. Use these allowed enums verbatim (the compiler lowers them to the --sa-* map + OKLCH ramp):',
    '  • shape.radius ∈ none·sm·md·lg·xl·full; shape.borderWidth ∈ none·thin·medium·thick; shape.elevation ∈ soft·glow·border·emboss.',
    '  • spacing.density ∈ compact·comfortable·airy; spacing.padding/margin/gap ∈ none·tight·medium·loose.',
    '  • motion.duration ∈ none·fast·base·slow; motion.easing ∈ standard·enter·exit·mechanical.',
    '  • typography.size ∈ XS·SM·MD·LG·XL·2XL; typography.weight ∈ normal·medium·bold; lineHeight ∈ tight·normal·relaxed; align ∈ left·center·right.',
    '',
    brandLine,
    fontLine,
    '',
    'Apple HIG floor (non-negotiable, encode into style + config):',
    '  • Contrast: body text vs its background ≥ 4.5:1; large/bold ≥ 3:1. Never signal state by color alone — pair with icon/text.',
    '  • Type: body weight ≥ medium/bold (never thin); ≤ 2 font families; hierarchy via size/weight/color.',
    '  • Buttons: exactly ONE dominant primary CTA; at most two prominent buttons; secondary is low-emphasis. Verb-first, title-case labels. Include a pressed state.',
    '  • Overlays over imagery: set style.colors.overlayBackdropOpacity ≥ 0.35 (dimming scrim).',
    '  • Motion: subtle, purposeful, cancelable, 80–500ms; set style.accessibility.reducedMotion = true.',
    '  • Accessibility: 44×44px tap targets; visible focus ring — set style.accessibility.focusVisible = true.',
    '',
    effectsLine,
    '',
    'Mobile-first: design for a 375px-wide phone first, enhance up. Body text reads at ≥16px; tap targets are generous; on mobile a popup is a near-full card/bottom-sheet with a large close and the CTA in easy thumb reach. No behavior may depend on hover.',
    '',
    'Micro-interactions (mandatory — the full F1–F8 set): the module must account for F1 press, F2 hover, F3 focus-ring, F4 entrance, F5 success, F6 loading, F7 empty, and F8 error states — described in config/explanation and reflected in style.accessibility. F5 success and F8 error use icon + text, never color alone. A control with only idle+hover reads "templated".',
    '',
    'Self-audit before returning: re-check your recipe against the contrast, single-primary-CTA, scrim, reduced-motion, focus-visible, named-token, and F1–F8 rules above; fix any violation before you output. A generic centered hero with vague copy, a rainbow palette, >2 fonts, raw px/hex tokens, or color-only status is "slop" and will be rejected.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

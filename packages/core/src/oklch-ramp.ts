/**
 * OKLCH semantic color ramp generator (phase #2 / spec 029, design-vocabulary §1.1).
 *
 * Generated storefront modules seed their colors from the MERCHANT's extracted
 * brand accent (never the app brand) and derive a perceptually-even 12-step ramp
 * in OKLCH, then map it to Radix-style semantic roles with guaranteed-legible
 * `-content` pairing. Pure + deterministic (no deps, no randomness) so the same
 * seed always yields the same ramp and it round-trips in tests.
 *
 * Color math from Björn Ottosson's OKLab reference (public domain).
 */

// ── sRGB gamma ───────────────────────────────────────────────────────────────
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ── hex ⇄ rgb (0–1) ──────────────────────────────────────────────────────────
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
export function rgbToHex(rgb: [number, number, number]): string {
  const to = (c: number) =>
    Math.round(clamp01(c) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}

// ── linear sRGB ⇄ OKLab ⇄ OKLCH ──────────────────────────────────────────────
type Oklch = { L: number; C: number; H: number };

function linRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}
function oklabToLinRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex);
  const [L, a, bb] = linRgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
  return { L, C: Math.hypot(a, bb), H: Math.atan2(bb, a) };
}

/** OKLCH → linear sRGB (may be out of [0,1] gamut). */
function oklchToLinRgb({ L, C, H }: Oklch): [number, number, number] {
  return oklabToLinRgb(L, C * Math.cos(H), C * Math.sin(H));
}
function inGamut(c: Oklch): boolean {
  const [r, g, b] = oklchToLinRgb(c);
  const eps = 1e-4;
  return [r, g, b].every((v) => v >= -eps && v <= 1 + eps);
}

/** OKLCH → hex, gamut-mapped by reducing chroma (binary search) until in sRGB. */
export function oklchToHex(c: Oklch): string {
  let C = c.C;
  if (!inGamut(c)) {
    let lo = 0;
    let hi = c.C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut({ L: c.L, C: mid, H: c.H })) lo = mid;
      else hi = mid;
    }
    C = lo;
  }
  const [lr, lg, lb] = oklchToLinRgb({ L: c.L, C, H: c.H });
  return rgbToHex([linearToSrgb(clamp01(lr)), linearToSrgb(clamp01(lg)), linearToSrgb(clamp01(lb))]);
}

// ── Contrast / -content pairing ──────────────────────────────────────────────
/** WCAG relative luminance of a hex color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
/** The legible foreground for a surface — near-black or near-white, whichever wins contrast. */
export function contentColor(bgHex: string): string {
  const dark = '#111827';
  const light = '#ffffff';
  return contrastRatio(bgHex, dark) >= contrastRatio(bgHex, light) ? dark : light;
}

// ── The 12-step semantic ramp ────────────────────────────────────────────────
/**
 * Radix-style 12-step lightness targets (light theme) + a chroma profile that
 * peaks at the solid step (9) and eases toward the neutral ends. Hue is held
 * from the seed so the whole ramp reads as one brand family.
 */
const L_TARGETS = [0.993, 0.977, 0.958, 0.935, 0.907, 0.868, 0.804, 0.715, 0.62, 0.57, 0.5, 0.26];
const C_FACTORS = [0.05, 0.09, 0.14, 0.2, 0.28, 0.4, 0.55, 0.72, 1.0, 0.94, 0.7, 0.42];

export type SemanticRamp = {
  /** 12 hex steps (index 0 = step 1). */
  steps: string[];
  bg: string; // 1
  bgSubtle: string; // 2
  componentBg: string; // 3
  componentHover: string; // 4
  componentActive: string; // 5
  borderSubtle: string; // 6
  border: string; // 7
  borderStrong: string; // 8
  solid: string; // 9 — the brand solid
  solidHover: string; // 10
  textLow: string; // 11 — secondary text
  textHigh: string; // 12 — primary text
  /** Legible foreground on the solid (step 9) — the -content pairing. */
  solidContent: string;
};

/**
 * Generate a 12-step OKLCH semantic ramp from a merchant brand seed color.
 * Deterministic: same seed → same ramp.
 */
export function generateSemanticRamp(seedHex: string): SemanticRamp {
  const seed = hexToOklch(seedHex);
  // A near-gray seed (C≈0) still needs a faint tint so steps read as a family.
  const baseC = Math.max(seed.C, 0.04);
  const steps = L_TARGETS.map((L, i) => oklchToHex({ L, C: baseC * (C_FACTORS[i] ?? 0), H: seed.H }));
  const s = steps as [
    string, string, string, string, string, string,
    string, string, string, string, string, string,
  ];
  return {
    steps,
    bg: s[0],
    bgSubtle: s[1],
    componentBg: s[2],
    componentHover: s[3],
    componentActive: s[4],
    borderSubtle: s[5],
    border: s[6],
    borderStrong: s[7],
    solid: s[8],
    solidHover: s[9],
    textLow: s[10],
    textHigh: s[11],
    solidContent: contentColor(s[8]),
  };
}

import type { StorefrontStyle } from '@superapp/core';

const PADDING_MAP = { none: '0', tight: '8px', medium: '16px', loose: '24px' } as const;
const GAP_MAP = { none: '0', tight: '8px', medium: '12px', loose: '20px' } as const;
const FONT_SIZE_MAP = { XS: '12px', SM: '14px', MD: '16px', LG: '18px', XL: '20px', '2XL': '24px' } as const;
const FONT_WEIGHT_MAP = { normal: '400', medium: '500', bold: '700' } as const;
const LINE_HEIGHT_MAP = { tight: '1.25', normal: '1.5', relaxed: '1.75' } as const;
const RADIUS_MAP = { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' } as const;
const BORDER_WIDTH_MAP = { none: '0', thin: '1px', medium: '2px', thick: '4px' } as const;
const SHADOW_MAP = {
  none: 'none',
  sm: '0 1px 3px rgba(0,0,0,0.12)',
  md: '0 4px 12px rgba(0,0,0,0.15)',
  lg: '0 18px 70px rgba(0,0,0,0.25)',
} as const;
const Z_INDEX_MAP = { base: '10', dropdown: '100', sticky: '30', overlay: '1000', modal: '1100' } as const;
const WIDTH_MAP = {
  auto: 'auto',
  container: 'min(100%, 1200px)',
  narrow: 'min(100%, 480px)',
  wide: 'min(100%, 720px)',
  full: '100%',
} as const;

/** Default style (matches StorefrontStyleSchema defaults). No runtime dependency on schema. */
export const DEFAULT_STOREFRONT_STYLE: StorefrontStyle = {
  layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'sticky' },
  spacing: { padding: 'medium', margin: 'none', gap: 'medium' },
  typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
  colors: {
    text: '#111111',
    background: '#ffffff',
    overlayBackdropOpacity: 0.45,
  },
  shape: { radius: 'md', borderWidth: 'none', shadow: 'none' },
  responsive: { hideOnMobile: false, hideOnDesktop: false },
  accessibility: { focusVisible: true, reducedMotion: true },
  customCss: undefined,
};

export function getDefaultStorefrontStyle(): StorefrontStyle {
  return { ...deepMergeStyle(DEFAULT_STOREFRONT_STYLE, {}) };
}

/**
 * Normalize style (fill defaults) for compilation. Safe to pass undefined.
 * Spec.style is already validated by RecipeSpecSchema; we only merge with defaults.
 */
export function normalizeStyle(style: StorefrontStyle | undefined): StorefrontStyle {
  if (!style) return getDefaultStorefrontStyle();
  return deepMergeStyle(DEFAULT_STOREFRONT_STYLE, style) as StorefrontStyle;
}

function deepMergeStyle(base: StorefrontStyle, overrides: Partial<StorefrontStyle>): StorefrontStyle {
  const out = { ...base };
  for (const key of Object.keys(overrides) as (keyof StorefrontStyle)[]) {
    const v = overrides[key];
    if (v === undefined) continue;
    const b = (base as Record<string, unknown>)[key];
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && typeof b === 'object' && b !== null) {
      (out as Record<string, unknown>)[key] = { ...(b as object), ...(v as object) };
    } else {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

/**
 * Compile style to CSS custom properties (--sa-*). Use on the module root so
 * Liquid/CSS can reference var(--sa-text), var(--sa-bg), etc. Theme-safe.
 */
export function compileStyleVars(style: StorefrontStyle | undefined): string {
  const s = normalizeStyle(style);
  const pad = PADDING_MAP[s.spacing.padding];
  const gap = GAP_MAP[s.spacing.gap];
  const margin = PADDING_MAP[s.spacing.margin];
  const fs = FONT_SIZE_MAP[s.typography.size];
  const fw = FONT_WEIGHT_MAP[s.typography.weight];
  const lh = LINE_HEIGHT_MAP[s.typography.lineHeight];
  const radius = RADIUS_MAP[s.shape.radius];
  const borderW = BORDER_WIDTH_MAP[s.shape.borderWidth];
  const shadow = SHADOW_MAP[s.shape.shadow];
  const z = Z_INDEX_MAP[s.layout.zIndex];
  const width = WIDTH_MAP[s.layout.width];
  const offsetX = `${s.layout.offsetX}px`;
  const offsetY = `${s.layout.offsetY}px`;

  const lines: string[] = [
    `--sa-text: ${s.colors.text};`,
    `--sa-bg: ${s.colors.background};`,
    `--sa-pad: ${pad};`,
    `--sa-gap: ${gap};`,
    `--sa-margin: ${margin};`,
    `--sa-fs: ${fs};`,
    `--sa-fw: ${fw};`,
    `--sa-lh: ${lh};`,
    `--sa-radius: ${radius};`,
    `--sa-border-width: ${borderW};`,
    `--sa-shadow: ${shadow};`,
    `--sa-z: ${z};`,
    `--sa-width: ${width};`,
    `--sa-offset-x: ${offsetX};`,
    `--sa-offset-y: ${offsetY};`,
  ];
  if (s.colors.border != null) lines.push(`--sa-border: ${s.colors.border};`);
  if (s.colors.buttonBg != null) lines.push(`--sa-btn-bg: ${s.colors.buttonBg};`);
  if (s.colors.buttonText != null) lines.push(`--sa-btn-text: ${s.colors.buttonText};`);
  const opacity = s.colors.overlayBackdropOpacity ?? 0.45;
  if (s.colors.overlayBackdrop != null) {
    const r = parseInt(s.colors.overlayBackdrop.slice(1, 3), 16);
    const g = parseInt(s.colors.overlayBackdrop.slice(3, 5), 16);
    const b = parseInt(s.colors.overlayBackdrop.slice(5, 7), 16);
    lines.push(`--sa-backdrop: rgba(${r},${g},${b},${opacity});`);
  } else {
    lines.push(`--sa-backdrop: rgba(0,0,0,${opacity});`);
  }
  return lines.join('\n');
}

/**
 * Compile a small CSS snippet that applies --sa-* vars to a root selector.
 * Pass the root selector (e.g. .superapp-banner or .superapp-popup).
 * Safe for inline/section use; no arbitrary values.
 */
export function compileStyleCss(style: StorefrontStyle | undefined, rootSelector: string): string {
  const s = normalizeStyle(style);
  const align = s.typography.align;
  const rules: string[] = [
    `${rootSelector}{`,
    `color: var(--sa-text);`,
    `background: var(--sa-bg);`,
    `padding: var(--sa-pad);`,
    `gap: var(--sa-gap);`,
    `margin: var(--sa-margin);`,
    `font-size: var(--sa-fs);`,
    `font-weight: var(--sa-fw);`,
    `line-height: var(--sa-lh);`,
    `text-align: ${align};`,
    `border-radius: var(--sa-radius);`,
    `box-shadow: var(--sa-shadow);`,
    `}`,
  ];
  if (s.shape.borderWidth !== 'none') {
    rules.push(
      `${rootSelector}{ border-width: var(--sa-border-width); border-style: solid; border-color: var(--sa-border, currentColor); }`
    );
  }
  return rules.join('\n');
}

/**
 * Compile overlay-specific positioning (for popup/overlay modules). Returns CSS
 * for the overlay host (position, inset, z-index) and panel with safe offsets.
 */
export function compileOverlayPositionCss(
  style: StorefrontStyle | undefined,
  hostSelector: string,
  panelSelector: string
): string {
  const s = normalizeStyle(style);
  const z = Z_INDEX_MAP[s.layout.zIndex];
  return [
    `${hostSelector}{ position: fixed; inset: 0; z-index: ${z}; }`,
    `${panelSelector}{ position: relative; margin: calc(10vh + var(--sa-offset-y)) var(--sa-offset-x) auto; max-width: var(--sa-width); }`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Custom CSS
// ---------------------------------------------------------------------------

/** Patterns stripped from custom CSS to prevent injection / unsafe patterns. */
const DANGEROUS_CSS_PATTERNS: RegExp[] = [
  /<\/?script/gi,
  /<\/?style/gi,
  /expression\s*\(/gi,
  /javascript\s*:/gi,
  /@import\b/gi,
  /url\s*\(/gi,
  /content\s*:\s*['"]?data:/gi,
  /-moz-binding\s*:/gi,
  /behavior\s*:/gi,
];

/**
 * Sanitize merchant-provided custom CSS.
 * - Strips dangerous patterns (see list above)
 * - Removes HTML tags
 * - Truncates to 2000 chars (mirrors schema max)
 */
export function sanitizeCustomCss(css: string): string {
  if (!css) return '';
  let out = css.slice(0, 2000);
  for (const re of DANGEROUS_CSS_PATTERNS) {
    out = out.replace(re, '/* removed */');
  }
  out = out.replace(/<[^>]*>/g, '');
  return out.trim();
}

/**
 * Compile sanitized custom CSS scoped to a root selector.
 * Rules without a selector are automatically wrapped in `rootSelector { … }`.
 * Rules that already contain a selector are prefixed with rootSelector.
 *
 * Returns an empty string when there is no custom CSS.
 */
export function compileCustomCss(
  style: StorefrontStyle | undefined,
  rootSelector: string
): string {
  const raw = style?.customCss;
  if (!raw) return '';
  const sanitized = sanitizeCustomCss(raw);
  if (!sanitized) return '';

  const hasBlock = /\{/.test(sanitized);
  if (hasBlock) {
    // Prefix every top-level selector with rootSelector for scoping
    const scoped = sanitized.replace(
      /([^{}]+)\s*(\{)/g,
      (_, selector, brace) => {
        const trimmed = selector.trim();
        if (!trimmed || trimmed.startsWith('@')) return `${trimmed} ${brace}`;
        return `${rootSelector} ${trimmed} ${brace}`;
      }
    );
    return `/* custom css */\n${scoped}`;
  }
  // Plain declarations — wrap in root selector
  return `/* custom css */\n${rootSelector}{ ${sanitized} }`;
}

/**
 * Design-QA gate (Design System Bible §G — the "never a miss" gate).
 *
 * Runs the spec-level subset of the §G1 auto-checks against a generated
 * RecipeSpec and applies deterministic, schema-safe auto-fixes (scrim opacity,
 * focus-visible, reduced-motion). Checks that need a real DOM render
 * (touch-target px, overflow, 200% type) are out of scope here and live in
 * dossier §G1 (1–24) for the render-time checker.
 *
 * Color-changing fixes (contrast) are NOT auto-applied — recoloring a brand is
 * risky — they are reported as failures with a suggested fix so the caller can
 * regenerate or surface a warning.
 *
 * Pure + DB-free. Source: docs/design-system/research-dossier.md §A2,§A7,§A9,§F,§G.
 */
import type { RecipeSpec } from '@superapp/core';
import { isHexColor, relativeLuminance } from '~/services/ai/style-packs.server';

export type QaSeverity = 'fail' | 'warn';

export type QaIssue = {
  id: string;
  severity: QaSeverity;
  message: string;
  /** True when this run mutated the recipe to resolve the issue. */
  autofixed: boolean;
};

export type DesignQaResult = {
  /** True when no `fail` issues remain after auto-fixes. */
  pass: boolean;
  issues: QaIssue[];
  /** The (possibly auto-corrected) recipe to store. */
  recipe: RecipeSpec;
};

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

type LooseStyle = {
  colors?: {
    text?: string;
    background?: string;
    buttonBg?: string;
    buttonText?: string;
    overlayBackdrop?: string;
    overlayBackdropOpacity?: number;
  };
  accessibility?: { focusVisible?: boolean; reducedMotion?: boolean };
};

const DARK_SCRIM = '#0F172A';

/**
 * Audit a generated storefront recipe and apply safe auto-fixes.
 * Non-storefront recipes (no style block) pass through untouched.
 */
/**
 * Visual surfaces that carry a StorefrontStyle block. Non-visual recipes
 * (functions.*, flow.*, integration.*, analytics.*) have no style and must not
 * have one synthesized onto them.
 */
function isVisualRecipe(recipe: RecipeSpec): boolean {
  if ((recipe as { style?: unknown }).style != null) return true;
  const t = recipe.type;
  return (
    t === 'theme.section' ||
    t === 'proxy.widget' ||
    t.startsWith('checkout.') ||
    t.startsWith('customerAccount.') ||
    t.startsWith('postPurchase.') ||
    t === 'admin.block'
  );
}

export function runDesignQa(recipe: RecipeSpec): DesignQaResult {
  // No-op for non-visual recipes (cart-transform & other functions have no UI
  // surface to audit, and must not get a synthesized style block).
  if (!isVisualRecipe(recipe)) {
    return { pass: true, issues: [], recipe };
  }

  const issues: QaIssue[] = [];

  // Work on a clone so callers can compare / fall back to the original.
  const next = structuredClone(recipe) as RecipeSpec & { style?: LooseStyle; config?: Record<string, unknown> };
  const style = (next.style ?? (next.style = {})) as LooseStyle;
  const colors = (style.colors ?? (style.colors = {}));
  const a11y = (style.accessibility ?? (style.accessibility = {}));

  const activation = (next.config as { activation?: string } | undefined)?.activation;
  const kind = (next.config as { kind?: string } | undefined)?.kind;
  const isOverlay = activation === 'overlay' || kind === 'popup' || kind === 'modal';
  const isEffect = kind === 'effect';

  // --- G1.1/G1.2 Contrast: report (do not recolor the brand) ----------------
  if (isHexColor(colors.text) && isHexColor(colors.background)) {
    const ratio = contrastRatio(colors.text, colors.background);
    if (ratio < 4.5) {
      issues.push({
        id: 'contrast-body',
        severity: 'fail',
        message: `Body text contrast ${ratio.toFixed(2)}:1 is below 4.5:1 (text ${colors.text} on ${colors.background}). Darken text or lighten the surface.`,
        autofixed: false,
      });
    }
  }
  if (isHexColor(colors.buttonText) && isHexColor(colors.buttonBg)) {
    const ratio = contrastRatio(colors.buttonText, colors.buttonBg);
    if (ratio < 3) {
      issues.push({
        id: 'contrast-button',
        severity: 'fail',
        message: `Button label contrast ${ratio.toFixed(2)}:1 is below 3:1 (label ${colors.buttonText} on ${colors.buttonBg}).`,
        autofixed: false,
      });
    }
  }

  // --- G1.22 Media scrim on overlays (auto-fix) -----------------------------
  if (isOverlay) {
    const op = colors.overlayBackdropOpacity;
    if (typeof op !== 'number' || op < 0.35) {
      colors.overlayBackdropOpacity = 0.35;
      if (!isHexColor(colors.overlayBackdrop)) colors.overlayBackdrop = DARK_SCRIM;
      issues.push({
        id: 'scrim',
        severity: 'warn',
        message: 'Overlay had no/weak dimming scrim — set overlayBackdropOpacity to 0.35 for legibility over content.',
        autofixed: true,
      });
    }
  }

  // --- G1.12 Focus visible (auto-fix) ---------------------------------------
  if (a11y.focusVisible !== true) {
    a11y.focusVisible = true;
    issues.push({
      id: 'focus-visible',
      severity: 'warn',
      message: 'Focus ring was not guaranteed — set accessibility.focusVisible = true.',
      autofixed: true,
    });
  }

  // --- G1.15 Reduced-motion branch (auto-fix when unset) --------------------
  if (a11y.reducedMotion === undefined) {
    a11y.reducedMotion = true;
    issues.push({
      id: 'reduced-motion',
      severity: 'warn',
      message: 'reducedMotion was unset — defaulted to true so the module honors prefers-reduced-motion.',
      autofixed: true,
    });
  } else if (a11y.reducedMotion === false && isEffect) {
    // An animated effect that ignores reduced motion is an accessibility miss.
    issues.push({
      id: 'reduced-motion-effect',
      severity: 'fail',
      message: 'Animated effect explicitly disables reduced-motion handling — set accessibility.reducedMotion = true.',
      autofixed: false,
    });
  }

  const pass = !issues.some((i) => i.severity === 'fail');
  return { pass, issues, recipe: next as RecipeSpec };
}

/** One-line summary for logs / audit trails. */
export function summarizeQa(result: DesignQaResult): string {
  const fails = result.issues.filter((i) => i.severity === 'fail').length;
  const fixes = result.issues.filter((i) => i.autofixed).length;
  return `design-qa: ${result.pass ? 'pass' : 'FAIL'} (${fails} blocking, ${fixes} auto-fixed, ${result.issues.length} total)`;
}

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
  pack?: string;
  motion?: { duration?: string; easing?: string };
  shape?: { radius?: string };
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

  // Capture what the model actually authored (pre-auto-fix) so the F1–F8
  // presence heuristic can tell "the generator accounted for it" from
  // "we defaulted it in".
  const originalA11y = ((recipe as { style?: LooseStyle }).style?.accessibility ?? {}) as {
    focusVisible?: boolean;
    reducedMotion?: boolean;
  };

  // Work on a clone so callers can compare / fall back to the original.
  const next = structuredClone(recipe) as RecipeSpec & { style?: LooseStyle; config?: Record<string, unknown> };
  const style = (next.style ?? (next.style = {})) as LooseStyle;
  const colors = (style.colors ?? (style.colors = {}));
  const a11y = (style.accessibility ?? (style.accessibility = {}));

  const config = (next.config ?? {}) as Record<string, unknown>;
  const activation = (config as { activation?: string }).activation;
  const kind = (config as { kind?: string }).kind;
  const isOverlay = activation === 'overlay' || kind === 'popup' || kind === 'modal';
  const isEffect = kind === 'effect';

  // Does the module carry actions or a form? Drives the F5/F8 status-signalling
  // heuristic below (success/error must be icon+text, never color alone).
  const configFields = (config.fields ?? {}) as Record<string, unknown>;
  const blocks = Array.isArray(config.blocks) ? (config.blocks as Array<Record<string, unknown>>) : [];
  const hasCta =
    ['ctaText', 'ctaUrl', 'ctaLabel', 'actionUrl', 'linkUrl', 'linkText'].some(
      (k) => typeof config[k] === 'string' && (config[k] as string).length > 0,
    ) ||
    ['ctaText', 'ctaLabel', 'linkText'].some((k) => typeof configFields[k] === 'string') ||
    blocks.some((b) => b?.kind === 'cta');
  const isForm =
    kind === 'contactForm' ||
    kind === 'newsletter' ||
    typeof config.submissionMode === 'string' ||
    typeof config.spamProtection === 'string';
  const hasActionsOrForms = hasCta || isForm;

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
  }

  // --- §6 Per-effect reduced-motion (blocking [AUTO]) -----------------------
  // Every `effect` module must ship a prefers-reduced-motion branch that
  // renders nothing (§6). Anything other than an explicit `true` is a miss.
  // We force the flag on as a safety net, but an effect that explicitly opted
  // OUT signals a motion-heavy design that should be regenerated, so it stays a
  // blocking failure for the caller's regenerate loop.
  if (isEffect && a11y.reducedMotion !== true) {
    // undefined was already coerced to true above; reaching here means === false.
    a11y.reducedMotion = true;
    issues.push({
      id: 'reduced-motion-effect',
      severity: 'fail',
      message:
        'Animated effect disabled reduced-motion — §6 requires every effect to render nothing under prefers-reduced-motion. Forced reducedMotion=true; regenerate a reduced-motion-safe effect.',
      autofixed: true,
    });
  }

  // --- §4.1 Gamified-popup QA (spin-to-win wheel + scratch card) -------------
  // The popup branch upgrades to a wheel when blocks carry kind:'slice' and to a
  // scratch card for kind:'scratch' (module-design-system.md §4.1). These checks
  // guard the game-specific footguns; a classic popup (no game blocks) is untouched.
  const sliceBlocks = blocks.filter((b) => b?.kind === 'slice');
  const scratchBlocks = blocks.filter((b) => b?.kind === 'scratch');
  const isGamePopup = (kind === 'popup' || isOverlay) && sliceBlocks.length + scratchBlocks.length > 0;

  if (isGamePopup && sliceBlocks.length > 0) {
    // Weighted-random pick is over fields.oddsWeight (§4.1). Treat absent / non-positive
    // as weight 0 — that's what the runtime falls back on (equal split).
    const weights = sliceBlocks.map((b) => {
      const w = (b.fields as Record<string, unknown> | undefined)?.oddsWeight;
      return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 0;
    });
    const total = weights.reduce((a, c) => a + c, 0);
    if (total <= 0) {
      issues.push({
        id: 'game-odds:uniform',
        severity: 'warn',
        message: `Spin-to-win has ${sliceBlocks.length} slices but no positive fields.oddsWeight on any — the wheel falls back to a uniform (equal) split, which is likely unintended. Set fields.oddsWeight per slice to control win rates.`,
        autofixed: false,
      });
    } else if (sliceBlocks.length > 1) {
      const max = Math.max(...weights);
      if (max / total >= 0.95) {
        issues.push({
          id: 'game-odds:dominant',
          severity: 'warn',
          message: `One spin-to-win slice holds ${((max / total) * 100).toFixed(0)}% of the total odds weight (≥95%) — the wheel almost always lands on it, so the other slices are decorative. Rebalance fields.oddsWeight if that isn't intended.`,
          autofixed: false,
        });
      }
    }
  }

  // Game popups animate a spin/scratch reveal — they MUST honor prefers-reduced-motion
  // (instant reveal, §7.4). Mirror the §6 effect severity: undefined was already
  // coerced to true above, so reaching a non-true value here means an explicit false —
  // a motion-heavy design that should be regenerated (blocking).
  if (isGamePopup && a11y.reducedMotion !== true) {
    a11y.reducedMotion = true;
    issues.push({
      id: 'reduced-motion-game',
      severity: 'fail',
      message:
        'Gamified popup (spin-to-win / scratch card) disabled reduced-motion — §7.4 requires an instant coupon reveal under prefers-reduced-motion (no dial spin, no scratch-erase). Forced reducedMotion=true; regenerate a reduced-motion-safe game.',
      autofixed: true,
    });
  }
  // NOTE (future work): a generation-side coupon-code-fabrication check (the model
  // must not invent fields.couponCode values the merchant never configured) is NOT
  // added here — an empty code is an honest no-prize state at runtime (§4.1), and the
  // fabrication risk lives in generation, not spec validation. An email-capture field
  // block on a game popup is fine (gate handled at runtime) — intentionally no check.

  // --- §7.1 F1–F8 mandatory micro-interaction presence heuristic ------------
  // Spec-level surfaces can't prove the rendered state set, so these are soft
  // `warn`s that flag when the generator did not visibly account for the
  // mandatory interaction states. focusVisible (F3) and reducedMotion are also
  // hard-enforced above; here we document the F-set coverage gap.
  const isInteractive = hasActionsOrForms || isEffect || kind === 'popup' || kind === 'floatingWidget';
  if (isInteractive) {
    const missingFlags: string[] = [];
    if (originalA11y.focusVisible !== true) missingFlags.push('focusVisible (F3)');
    if (originalA11y.reducedMotion !== true) missingFlags.push('reducedMotion');
    if (missingFlags.length > 0) {
      issues.push({
        id: 'micro-interaction:accessibility-flags',
        severity: 'warn',
        message: `Interactive module did not declare ${missingFlags.join(
          ' + ',
        )} — the F1–F8 mandatory set (§7.1) requires them (auto-applied).`,
        autofixed: true,
      });
    }
  }
  if (hasActionsOrForms) {
    issues.push({
      id: 'micro-interaction:status-icon-text',
      severity: 'warn',
      message:
        'Module has actions/forms — verify success (F5) and error (F8) states are signalled by icon + text, never color alone (§1.4/§7.1), and that the full state set (idle·hover·pressed·focus·selected·disabled·entering·exiting) is covered.',
      autofixed: false,
    });
  }

  // --- §3 Pack / palette fidelity (soft warn) -------------------------------
  // Each resolved render pack has a motion + shape personality (§3.1/§3.2/§3.2a/§3.2b).
  // Wildly off-pack tokens read wrong; warn (never hard-fail — merchant/theme
  // overrides can legitimately diverge).
  const pack = style.pack;
  const motionDuration = style.motion?.duration;
  const shapeRadius = style.shape?.radius;
  const pushMotion = (message: string) =>
    issues.push({ id: 'pack-fidelity:motion', severity: 'warn', message, autofixed: false });
  const pushShape = (message: string) =>
    issues.push({ id: 'pack-fidelity:shape', severity: 'warn', message, autofixed: false });
  if (pack === 'luxe') {
    if (motionDuration === 'fast') {
      pushMotion('Luxe pack favors slow/long fades (§3.1); motion.duration="fast" reads Bold — prefer "slow" or "base".');
    }
    if (shapeRadius && ['lg', 'xl', 'full'].includes(shapeRadius)) {
      pushShape(`Luxe pack uses none–sm radius (§3.1); shape.radius="${shapeRadius}" is off-pack.`);
    }
  } else if (pack === 'bold') {
    if (motionDuration === 'slow') {
      pushMotion('Bold pack favors fast/snappy motion (§3.2); motion.duration="slow" reads Luxe — prefer "fast" or "base".');
    }
  } else if (pack === 'playful') {
    // Playful is rounded + springy (§3.2a): long fades and hard/square edges read off-pack.
    if (motionDuration === 'slow') {
      pushMotion('Playful pack favors springy "base" motion (§3.2a); motion.duration="slow" reads Luxe — prefer "base" or "fast".');
    }
    if (shapeRadius === 'none') {
      pushShape('Playful pack is rounded (§3.2a: lg–full radius); shape.radius="none" reads Utility/Luxe — prefer "lg"/"xl"/"full".');
    }
  } else if (pack === 'utility') {
    // Utility is compact + near-zero radius + fast mechanical (§3.2b).
    if (motionDuration === 'slow') {
      pushMotion('Utility pack favors fast/mechanical micro-motion (§3.2b); motion.duration="slow" reads Luxe — prefer "fast".');
    }
    if (shapeRadius && ['lg', 'xl', 'full'].includes(shapeRadius)) {
      pushShape(`Utility pack uses near-zero (none–sm) radius (§3.2b); shape.radius="${shapeRadius}" is off-pack.`);
    }
  }

  // --- §04/§6 Composition sanity (soft warns — applyCompositionRules is the
  // deterministic fixer; a warn here means a path skipped it) -----------------
  const layoutCfg = (config as { layout?: { layout?: string; columns?: number } }).layout;
  const blockCount = blocks.length;
  if (
    layoutCfg?.layout === 'grid' &&
    typeof layoutCfg.columns === 'number' &&
    blockCount > 0 &&
    (layoutCfg.columns > blockCount || (layoutCfg.columns >= 3 && blockCount % layoutCfg.columns === 1))
  ) {
    issues.push({
      id: 'composition:grid-orphan',
      severity: 'warn',
      message: `Grid has ${blockCount} blocks in ${layoutCfg.columns} columns — a lone item dangles in the last row (§6.1). applyCompositionRules should have clamped this.`,
      autofixed: false,
    });
  }
  const bodyText = typeof (config as { body?: string }).body === 'string' ? (config as { body?: string }).body! : '';
  if (style.pack !== undefined && (next.style as { typography?: { align?: string } })?.typography?.align === 'center' && bodyText.length > 280) {
    issues.push({
      id: 'composition:centered-paragraph',
      severity: 'warn',
      message: 'Long body copy is centered — §04: never center a paragraph; lists/body stay left.',
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

/**
 * Build a corrective instruction summarizing the blocking `[AUTO]` failures, to
 * append to a regeneration prompt (§9.1 stage 6 — "regenerates on `[AUTO]`
 * failure"). Returns '' when nothing is blocking, so callers can skip the retry.
 */
export function buildDesignQaCorrection(result: DesignQaResult): string {
  const fails = result.issues.filter((i) => i.severity === 'fail');
  if (fails.length === 0) return '';
  const lines = fails.map((i) => `- [${i.id}] ${i.message}`);
  return [
    '(DESIGN-QA CORRECTION — the previous output failed the non-negotiable Apple-HIG accessibility floor (module design system §1.4). Regenerate the SAME module and requirements, changing ONLY what is needed to fix these blocking issues while preserving everything else:)',
    ...lines,
  ].join('\n');
}

import type { CompileResult, ThemeModulePayload } from './types';
import type { RecipeSpec, DeployTarget, StorefrontStyle, RuleEnginePack } from '@superapp/core';
import { isServerResolvable } from '@superapp/core';
import { compileStyleVars, compileStyleCss, compileCustomCss } from './style-compiler';

/**
 * The visible element a module's presentation (color/bg/padding/radius/shadow)
 * must paint, expressed relative to the `[data-module-id]` root. Most kinds paint
 * the root itself, but two kinds render the root as a *non-visible* structural
 * host — applying the base rules there would break the layout:
 *   - `popup`  → the root is a full-viewport `position:fixed` overlay host. Painting
 *     its bg/padding turns it into an opaque sheet that hides the page behind the
 *     scrim; the merchant style belongs on the inner `.superapp-popup__panel` card.
 *   - `floatingWidget` → the root is a positioning-only fixed container. Painting
 *     bg/padding/border draws a spurious card around the pill and shifts it off its
 *     corner anchor. The pill (`.superapp-fw`) carries its own signature shape
 *     (pill radius, compact padding, elevated shadow); overriding it with the
 *     generic `--sa-radius`/`--sa-pad` block would distort that identity. So — like
 *     PreviewService, which renders the pill hardcoded — the widget gets the `--sa-*`
 *     vars (readable by any inner label/icon) but NO generic base rules.
 * `effect` renders a decorative particle overlay with no styleable surface, so it
 * likewise gets no base rules. This mirrors PreviewService's per-kind style targets.
 */
const STYLE_TARGET_SUFFIX: Record<string, string | null> = {
  popup: ' .superapp-popup__panel',
  floatingWidget: null, // positioning-only host; pill keeps its own shape
  effect: null, // decorative overlay — no base presentation rules
};

/**
 * Resolve the module `kind` the way the storefront Liquid does: the modern
 * `config.kind`, falling back to the legacy named `theme.*` type. Kept in sync with
 * the `case mod_type` map in snippets/superapp-module.liquid.
 */
function resolveKind(specType: string, config: Record<string, unknown>): string {
  const explicit = config.kind;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  switch (specType) {
    case 'theme.banner':
      return 'banner';
    case 'theme.notificationBar':
      return 'notification-bar';
    case 'theme.popup':
      return 'popup';
    case 'theme.contactForm':
      return 'contactForm';
    case 'theme.effect':
      return 'effect';
    case 'theme.floatingWidget':
      return 'floatingWidget';
    default:
      return 'section';
  }
}

/**
 * Pre-compile a theme module's style to inline CSS scoped to its
 * `[data-module-id]` root: the `--sa-*` custom properties on the root (so the whole
 * subtree can read them via `var()`), the base rules that consume them — applied to
 * the correct *visible* element for the kind (see `STYLE_TARGET_SUFFIX`) — and the
 * sanitized, scoped custom CSS. Emitted inline by the storefront renderer so the
 * module's colors/spacing/tokens actually apply without breaking overlay/floating
 * kinds whose root is a structural host rather than the painted surface.
 */
function compileThemeStyleCss(style: StorefrontStyle, moduleId: string, kind: string): string {
  const root = `[data-module-id="${moduleId}"]`;
  const suffix = kind in STYLE_TARGET_SUFFIX ? STYLE_TARGET_SUFFIX[kind] : '';
  // `undefined` (kind not in map) → paint the root (default). `null` (effect) → no
  // base rules. A string suffix → paint the inner target element.
  const target = suffix === null ? null : `${root}${suffix}`;
  return [
    `${root}{${compileStyleVars(style)}}`,
    target ? compileStyleCss(style, target) : '',
    target ? compileCustomCss(style, target) : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Shared theme-module compiler (Module System v2 consolidation). The per-type
 * theme.* compilers were byte-identical except for `type` and `activationType`;
 * this centralizes that logic. Output is identical by construction so existing
 * per-type entry points can delegate here without changing deploy behavior.
 */
export function compileThemeModule(
  spec: Extract<RecipeSpec, { type: `theme.${string}` }>,
  target: Extract<DeployTarget, { kind: 'THEME' }>,
  activationType: ThemeModulePayload['activationType'],
): CompileResult {
  if (!target.moduleId) {
    throw new Error(`${spec.type} requires moduleId (publish via app extension).`);
  }
  const rawStyle = (spec as { style?: Record<string, unknown> }).style as Record<string, unknown> | undefined;
  const kind = resolveKind(spec.type, (spec as { config: Record<string, unknown> }).config);
  // R2.1 — display rules flow through verbatim in `config.ruleEngine`; also surface
  // a compiled convenience so the Liquid gate can skip walking the tree. Absent /
  // disabled rules → `true` (server-resolvable → always show), keeping legacy
  // modules unchanged.
  const ruleEngine = (spec as { config: { ruleEngine?: RuleEnginePack } }).config.ruleEngine;
  const payload: ThemeModulePayload = {
    type: spec.type,
    name: spec.name,
    activationType,
    config: (spec as { config: Record<string, unknown> }).config,
    style: rawStyle,
    styleCss: rawStyle ? compileThemeStyleCss(rawStyle as unknown as StorefrontStyle, target.moduleId, kind) : undefined,
    ruleServerResolvable: ruleEngine ? isServerResolvable(ruleEngine) : true,
  };
  return {
    ops: [{ kind: 'AUDIT', action: `compile.${spec.type}`, details: JSON.stringify({ moduleId: target.moduleId }) }],
    compiledJson: JSON.stringify({ metaobjectHandle: `superapp-module-${target.moduleId}` }),
    themeModulePayload: payload,
  };
}

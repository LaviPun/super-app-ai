import type { CompileResult, ThemeModulePayload } from './types';
import type { RecipeSpec, DeployTarget, StorefrontStyle } from '@superapp/core';
import { compileStyleVars, compileStyleCss, compileCustomCss } from './style-compiler';

/**
 * Pre-compile a theme module's style to inline CSS scoped to its
 * `[data-module-id]` root: the `--sa-*` custom properties on the root, the base
 * rules that consume them, and the sanitized, scoped custom CSS. Emitted inline by
 * the storefront renderer so the module's colors/spacing/tokens actually apply.
 */
function compileThemeStyleCss(style: StorefrontStyle, moduleId: string): string {
  const sel = `[data-module-id="${moduleId}"]`;
  return [`${sel}{${compileStyleVars(style)}}`, compileStyleCss(style, sel), compileCustomCss(style, sel)]
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
  const payload: ThemeModulePayload = {
    type: spec.type,
    name: spec.name,
    activationType,
    config: (spec as { config: Record<string, unknown> }).config,
    style: rawStyle,
    styleCss: rawStyle ? compileThemeStyleCss(rawStyle as unknown as StorefrontStyle, target.moduleId) : undefined,
  };
  return {
    ops: [{ kind: 'AUDIT', action: `compile.${spec.type}`, details: JSON.stringify({ moduleId: target.moduleId }) }],
    compiledJson: JSON.stringify({ metaobjectHandle: `superapp-module-${target.moduleId}` }),
    themeModulePayload: payload,
  };
}

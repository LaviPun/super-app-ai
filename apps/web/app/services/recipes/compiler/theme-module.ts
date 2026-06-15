import type { CompileResult, ThemeModulePayload } from './types';
import type { RecipeSpec, DeployTarget } from '@superapp/core';

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
  const payload: ThemeModulePayload = {
    type: spec.type,
    name: spec.name,
    activationType,
    config: (spec as { config: Record<string, unknown> }).config,
    style: (spec as { style?: Record<string, unknown> }).style as Record<string, unknown>,
  };
  return {
    ops: [{ kind: 'AUDIT', action: `compile.${spec.type}`, details: JSON.stringify({ moduleId: target.moduleId }) }],
    compiledJson: JSON.stringify({ metaobjectHandle: `superapp-module-${target.moduleId}` }),
    themeModulePayload: payload,
  };
}

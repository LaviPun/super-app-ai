import type { CompileResult, ThemeModulePayload } from './types';
import type { RecipeSpec } from '@superapp/core';
import type { DeployTarget } from '@superapp/core';

/** Theme modules deploy as $app:superapp_module metaobjects via PublishService. moduleId required. */
export function compileThemeEffect(
  spec: Extract<RecipeSpec, { type: 'theme.effect' }>,
  target: Extract<DeployTarget, { kind: 'THEME' }>
): CompileResult {
  if (!target.moduleId) {
    throw new Error('theme.effect requires moduleId (publish via app extension).');
  }
  const payload: ThemeModulePayload = {
    type: 'theme.effect',
    name: spec.name,
    activationType: 'global',
    config: spec.config as Record<string, unknown>,
    style: spec.style as Record<string, unknown>,
  };
  return {
    ops: [{ kind: 'AUDIT', action: 'compile.theme.effect', details: JSON.stringify({ moduleId: target.moduleId }) }],
    compiledJson: JSON.stringify({ metaobjectHandle: `superapp-module-${target.moduleId}` }),
    themeModulePayload: payload,
  };
}

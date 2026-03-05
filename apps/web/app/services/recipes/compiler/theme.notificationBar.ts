import type { CompileResult, ThemeModulePayload } from './types';
import type { RecipeSpec } from '@superapp/core';
import type { DeployTarget } from '@superapp/core';

/** Theme modules deploy via app extension (metafield). moduleId required. */
export function compileNotificationBar(
  spec: Extract<RecipeSpec, { type: 'theme.notificationBar' }>,
  target: Extract<DeployTarget, { kind: 'THEME' }>
): CompileResult {
  if (!target.moduleId) {
    throw new Error('theme.notificationBar requires moduleId (publish via app extension).');
  }
  const payload: ThemeModulePayload = {
    type: 'theme.notificationBar',
    name: spec.name,
    config: spec.config as Record<string, unknown>,
    style: spec.style as Record<string, unknown>,
  };
  return {
    ops: [{ kind: 'AUDIT', action: 'compile.theme.notificationBar', details: JSON.stringify({ moduleId: target.moduleId }) }],
    compiledJson: JSON.stringify({ namespace: 'superapp.theme', key: 'modules' }),
    themeModulePayload: payload,
  };
}

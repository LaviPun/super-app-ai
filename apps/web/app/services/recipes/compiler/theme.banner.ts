import type { CompileResult, ThemeModulePayload } from './types';
import type { RecipeSpec } from '@superapp/core';
import type { DeployTarget } from '@superapp/core';

const THEME_MODULES_NAMESPACE = 'superapp.theme';
const THEME_MODULES_KEY = 'modules';

/** Theme modules deploy via app extension (metafield). moduleId required. */
export function compileThemeBanner(
  spec: Extract<RecipeSpec, { type: 'theme.banner' }>,
  target: Extract<DeployTarget, { kind: 'THEME' }>
): CompileResult {
  if (!target.moduleId) {
    throw new Error('theme.banner requires moduleId (publish via app extension).');
  }
  const payload: ThemeModulePayload = {
    type: 'theme.banner',
    name: spec.name,
    config: spec.config as Record<string, unknown>,
    style: spec.style as Record<string, unknown>,
  };
  return {
    ops: [{ kind: 'AUDIT', action: 'compile.theme.banner', details: JSON.stringify({ moduleId: target.moduleId }) }],
    compiledJson: JSON.stringify({ namespace: THEME_MODULES_NAMESPACE, key: THEME_MODULES_KEY }),
    themeModulePayload: payload,
  };
}


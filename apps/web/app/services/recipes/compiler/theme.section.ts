import type { CompileResult } from './types';
import type { RecipeSpec, DeployTarget } from '@superapp/core';
import { compileThemeModule } from './theme-module';

/**
 * Generic storefront section / theme app extension compiler (Module System v2).
 * Subsumes the named theme.* compilers: activation comes from config, not type.
 */
export function compileThemeSection(
  spec: Extract<RecipeSpec, { type: 'theme.section' }>,
  target: Extract<DeployTarget, { kind: 'THEME' }>,
): CompileResult {
  const activation = spec.config.activation === 'overlay' ? 'global' : spec.config.activation;
  return compileThemeModule(spec, target, activation);
}

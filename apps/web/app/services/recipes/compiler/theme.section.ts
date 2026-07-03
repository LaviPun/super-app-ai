import type { CompileResult } from './types';
import type { RecipeSpec, DeployTarget } from '@superapp/core';
import { compileThemeModule } from './theme-module';
import { renderNativeSection } from './native-section';

/**
 * Generic storefront section / theme app extension compiler (Module System v2).
 * Subsumes the named theme.* compilers: activation comes from config, not type.
 *
 * Two compile mediums for the SAME `theme.section` spec (033):
 *   - `mode: 'native_section'` → a self-contained `sections/superapp-<slug>.liquid`
 *     file pushed via the Theme Files API. Emits a single `THEME_ASSET_UPSERT`
 *     op (no `themeModulePayload` — the two mediums are mutually exclusive).
 *   - default / absent / `'app_block'` → the shipped metaobject + theme-app-extension
 *     path. UNCHANGED: byte-identical to before `mode` existed.
 */
export function compileThemeSection(
  spec: Extract<RecipeSpec, { type: 'theme.section' }>,
  target: Extract<DeployTarget, { kind: 'THEME' }>,
): CompileResult {
  if (target.mode === 'native_section') {
    // Slug from moduleId (namespaced ownership so a push only ever overwrites a
    // prior SuperApp push), falling back to the module name.
    const slug = target.moduleId ?? spec.name;
    const { filename, liquid } = renderNativeSection(spec, { slug });
    return {
      ops: [
        { kind: 'THEME_ASSET_UPSERT', themeId: target.themeId, key: filename, value: liquid },
        {
          kind: 'AUDIT',
          action: `compile.theme.section.native`,
          details: JSON.stringify({ filename, themeId: target.themeId }),
        },
      ],
    };
  }

  const activation = spec.config.activation === 'overlay' ? 'global' : spec.config.activation;
  return compileThemeModule(spec, target, activation);
}

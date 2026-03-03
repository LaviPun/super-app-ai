import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileProxyWidget(spec: Extract<RecipeSpec, { type: 'proxy.widget' }>): CompileResult {
  // Stored as shop metafield; app proxy reads it by widgetId.
  const namespace = 'superapp.proxy';
  const key = spec.config.widgetId;

  return {
    ops: [
      { kind: 'SHOP_METAFIELD_SET', namespace, key, type: 'json', value: JSON.stringify(spec.config) },
      { kind: 'AUDIT', action: 'compile.proxy.widget', details: JSON.stringify({ namespace, key }) },
    ],
    compiledJson: JSON.stringify({ namespace, key }),
  };
}

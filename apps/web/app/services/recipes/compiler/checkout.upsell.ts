import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileCheckoutUpsell(spec: Extract<RecipeSpec, { type: 'checkout.upsell' }>): CompileResult {
  const namespace = 'superapp.checkout';
  const key = 'upsell';

  return {
    ops: [
      { kind: 'SHOP_METAFIELD_SET', namespace, key, type: 'json', value: JSON.stringify(spec.config) },
      { kind: 'AUDIT', action: 'compile.checkout.upsell' },
    ],
    compiledJson: JSON.stringify({ namespace, key }),
  };
}

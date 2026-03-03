import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileCartAndCheckoutValidation(spec: Extract<RecipeSpec, { type: 'functions.cartAndCheckoutValidation' }>): CompileResult {
  const namespace = 'superapp.functions';
  const key = 'cartAndCheckoutValidation';

  return {
    ops: [
      { kind: 'SHOP_METAFIELD_SET', namespace, key, type: 'json', value: JSON.stringify(spec.config) },
      { kind: 'AUDIT', action: 'compile.functions.cartAndCheckoutValidation' },
    ],
    compiledJson: JSON.stringify({ namespace, key }),
  };
}

import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileCartTransform(spec: Extract<RecipeSpec, { type: 'functions.cartTransform' }>): CompileResult {
  const namespace = 'superapp.functions';
  const key = 'cartTransform';

  return {
    ops: [
      { kind: 'SHOP_METAFIELD_SET', namespace, key, type: 'json', value: JSON.stringify(spec.config) },
      { kind: 'AUDIT', action: 'compile.functions.cartTransform' },
    ],
    compiledJson: JSON.stringify({ namespace, key }),
  };
}

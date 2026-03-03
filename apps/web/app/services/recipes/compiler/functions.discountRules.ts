import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileDiscountRules(spec: Extract<RecipeSpec, { type: 'functions.discountRules' }>): CompileResult {
  // Generic discount function reads rules from this shop metafield.
  const namespace = 'superapp.functions';
  const key = 'discountRules';

  return {
    ops: [
      { kind: 'SHOP_METAFIELD_SET', namespace, key, type: 'json', value: JSON.stringify(spec.config) },
      { kind: 'AUDIT', action: 'compile.functions.discountRules' },
    ],
    compiledJson: JSON.stringify({ namespace, key }),
  };
}

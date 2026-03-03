import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compilePaymentCustomization(spec: Extract<RecipeSpec, { type: 'functions.paymentCustomization' }>): CompileResult {
  const namespace = 'superapp.functions';
  const key = 'paymentCustomization';

  return {
    ops: [
      { kind: 'SHOP_METAFIELD_SET', namespace, key, type: 'json', value: JSON.stringify(spec.config) },
      { kind: 'AUDIT', action: 'compile.functions.paymentCustomization' },
    ],
    compiledJson: JSON.stringify({ namespace, key }),
  };
}

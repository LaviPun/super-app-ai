import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileDeliveryCustomization(spec: Extract<RecipeSpec, { type: 'functions.deliveryCustomization' }>): CompileResult {
  const namespace = 'superapp.functions';
  const key = 'deliveryCustomization';

  return {
    ops: [
      { kind: 'SHOP_METAFIELD_SET', namespace, key, type: 'json', value: JSON.stringify(spec.config) },
      { kind: 'AUDIT', action: 'compile.functions.deliveryCustomization' },
    ],
    compiledJson: JSON.stringify({ namespace, key }),
  };
}

import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileDeliveryCustomization(spec: Extract<RecipeSpec, { type: 'functions.deliveryCustomization' }>): CompileResult {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'deliveryCustomization', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.deliveryCustomization' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-deliveryCustomization' }),
  };
}

import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compilePaymentCustomization(spec: Extract<RecipeSpec, { type: 'functions.paymentCustomization' }>): CompileResult {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'paymentCustomization', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.paymentCustomization' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-paymentCustomization' }),
  };
}

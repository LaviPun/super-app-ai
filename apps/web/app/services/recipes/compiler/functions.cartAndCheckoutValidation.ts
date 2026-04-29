import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileCartAndCheckoutValidation(spec: Extract<RecipeSpec, { type: 'functions.cartAndCheckoutValidation' }>): CompileResult {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'cartAndCheckoutValidation', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.cartAndCheckoutValidation' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-cartAndCheckoutValidation' }),
  };
}

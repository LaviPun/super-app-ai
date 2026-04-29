import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileDiscountRules(spec: Extract<RecipeSpec, { type: 'functions.discountRules' }>): CompileResult {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'discountRules', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.discountRules' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-discountRules' }),
  };
}

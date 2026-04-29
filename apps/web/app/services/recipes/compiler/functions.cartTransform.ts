import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileCartTransform(spec: Extract<RecipeSpec, { type: 'functions.cartTransform' }>): CompileResult {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'cartTransform', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.cartTransform' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-cartTransform' }),
  };
}

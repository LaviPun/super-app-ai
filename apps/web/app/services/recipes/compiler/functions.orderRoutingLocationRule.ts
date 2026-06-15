import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileOrderRoutingLocationRule(spec: Extract<RecipeSpec, { type: 'functions.orderRoutingLocationRule' }>): CompileResult {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'orderRoutingLocationRule', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.orderRoutingLocationRule' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-orderRoutingLocationRule' }),
  };
}

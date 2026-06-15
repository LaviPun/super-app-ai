import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileFulfillmentConstraints(spec: Extract<RecipeSpec, { type: 'functions.fulfillmentConstraints' }>): CompileResult {
  return {
    ops: [
      { kind: 'FUNCTION_CONFIG_UPSERT', functionKey: 'fulfillmentConstraints', config: spec.config },
      { kind: 'AUDIT', action: 'compile.functions.fulfillmentConstraints' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: 'superapp-fn-fulfillmentConstraints' }),
  };
}

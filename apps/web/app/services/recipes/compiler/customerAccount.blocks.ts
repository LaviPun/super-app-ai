import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileCustomerAccountBlocks(spec: Extract<RecipeSpec, { type: 'customerAccount.blocks' }>): CompileResult {
  return {
    ops: [
      { kind: 'AUDIT', action: 'compile.customerAccount.blocks' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: `superapp-ca-block-${spec.config.target}` }),
    customerAccountBlockPayload: {
      type: 'customerAccount.blocks',
      name: spec.name,
      target: spec.config.target,
      config: spec.config as Record<string, unknown>,
    },
  };
}

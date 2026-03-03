import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileCustomerAccountBlocks(spec: Extract<RecipeSpec, { type: 'customerAccount.blocks' }>): CompileResult {
  const namespace = 'superapp.customer_account';
  const key = 'blocks';

  return {
    ops: [
      { kind: 'SHOP_METAFIELD_SET', namespace, key, type: 'json', value: JSON.stringify(spec.config) },
      { kind: 'AUDIT', action: 'compile.customerAccount.blocks' },
    ],
    compiledJson: JSON.stringify({ namespace, key }),
  };
}

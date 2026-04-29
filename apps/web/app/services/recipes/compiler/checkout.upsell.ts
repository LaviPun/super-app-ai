import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

export function compileCheckoutUpsell(spec: Extract<RecipeSpec, { type: 'checkout.upsell' }>): CompileResult {
  return {
    ops: [
      { kind: 'AUDIT', action: 'compile.checkout.upsell' },
    ],
    compiledJson: JSON.stringify({ metaobjectHandle: `superapp-checkout-upsell-${spec.name.toLowerCase().replace(/\s+/g, '-')}` }),
    checkoutUpsellPayload: {
      type: 'checkout.upsell',
      name: spec.name,
      config: spec.config as Record<string, unknown>,
    },
  };
}

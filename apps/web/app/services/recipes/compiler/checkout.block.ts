import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

/**
 * checkout.block deploys through the SAME shipped checkout UI extension as
 * checkout.upsell: PublishService writes a `$app:superapp_checkout_upsell`
 * metaobject and appends it to `superapp.checkout/upsell_refs`, which
 * `extensions/checkout-ui` reads (target `purchase.checkout.block.render`) and
 * renders generically via `CheckoutBlockRenderer`. So a custom checkout block is
 * a real, rendered deploy — not an AUDIT no-op.
 */
export function compileCheckoutBlock(spec: Extract<RecipeSpec, { type: 'checkout.block' }>): CompileResult {
  return {
    ops: [{ kind: 'AUDIT', action: 'compile.checkout.block' }],
    compiledJson: JSON.stringify({
      metaobjectHandle: `superapp-checkout-block-${spec.name.toLowerCase().replace(/\s+/g, '-')}`,
    }),
    checkoutUpsellPayload: {
      type: 'checkout.block',
      name: spec.name,
      config: spec.config as Record<string, unknown>,
    },
  };
}

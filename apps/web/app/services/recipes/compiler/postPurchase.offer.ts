import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

/**
 * postPurchase.offer deploys through the shipped checkout UI extension's
 * Thank-you / Order-status target (`purchase.thank-you.block.render` in
 * `extensions/checkout-ui`), which reads the same `superapp.checkout/upsell_refs`
 * list and renders via `CheckoutBlockRenderer`. Available on all plans (unlike
 * in-checkout blocks). A real, rendered deploy — not an AUDIT no-op.
 */
export function compilePostPurchaseOffer(spec: Extract<RecipeSpec, { type: 'postPurchase.offer' }>): CompileResult {
  return {
    ops: [{ kind: 'AUDIT', action: 'compile.postPurchase.offer' }],
    compiledJson: JSON.stringify({
      metaobjectHandle: `superapp-postpurchase-offer-${spec.name.toLowerCase().replace(/\s+/g, '-')}`,
    }),
    checkoutUpsellPayload: {
      type: 'postPurchase.offer',
      name: spec.name,
      config: spec.config as Record<string, unknown>,
    },
  };
}

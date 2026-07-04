/**
 * Shared mount for every checkout / thank-you target. The generic checkout UI
 * extension registers ONE renderer at ~30 targets; each per-target module file is a
 * one-line call to `mountCheckoutTarget(TARGET)`. This keeps the extension truly
 * config-driven — no per-target code, only a target string that selects the surface
 * behavior (buyer-input writes on checkout, read-only on thank-you).
 */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useCheckoutConfig } from '../hooks/useCheckoutConfig';
import { CheckoutBlockRenderer } from '../components/CheckoutBlockRenderer';
import type { AddToOrderResult } from '../components/CheckoutBlockRenderer';

/** Checkout-only cart-lines API used to add an upsell variant to the order. */
type CartLinesApi = {
  applyCartLinesChange?: (c: {
    type: 'addCartLine';
    merchandiseId: string;
    quantity: number;
  }) => Promise<{ type: 'success' | 'error' }>;
};

function makeAddToOrder(target: string): ((variantGid: string) => Promise<AddToOrderResult>) | undefined {
  // Only the checkout surface can add lines; thank-you/order-status cannot.
  if (!target.startsWith('purchase.checkout.')) return undefined;
  const api = (globalThis as unknown as { shopify?: CartLinesApi }).shopify;
  if (!api?.applyCartLinesChange) return undefined;
  return async (variantGid: string): Promise<AddToOrderResult> => {
    try {
      const result = await api.applyCartLinesChange!({
        type: 'addCartLine',
        merchandiseId: variantGid,
        quantity: 1,
      });
      return result?.type === 'success' ? 'success' : 'error';
    } catch {
      return 'error';
    }
  };
}

/** Render the generic checkout renderer for a specific target. */
export function mountCheckoutTarget(target: string): void {
  const onAddToOrder = makeAddToOrder(target);

  function CheckoutTarget() {
    const result = useCheckoutConfig(target);
    if (result.status === 'loading') return <s-text>Loading...</s-text>;
    if (result.status !== 'ready') return null;
    return <CheckoutBlockRenderer offers={result.offers} onAddToOrder={onAddToOrder} />;
  }

  render(<CheckoutTarget />, document.body);
}

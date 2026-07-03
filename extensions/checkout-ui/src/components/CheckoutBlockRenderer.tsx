/**
 * Renders published SuperApp checkout offers using only buyer-facing content:
 * heading, message, and resolved product details (title / image / price).
 * Internal config (GIDs, targets, raw JSON) is never shown to buyers; offers
 * with nothing buyer-facing are filtered out upstream and render nothing here.
 * Uses only checkout-safe components (s-stack, s-heading, s-paragraph, s-text,
 * s-product-thumbnail, s-button).
 */
import { useState } from 'preact/hooks';
import type { CheckoutOffer, OfferProduct } from '../hooks/useCheckoutConfig';

export type AddToOrderResult = 'success' | 'error';

type Props = {
  offers: CheckoutOffer[];
  /** Present only on the checkout surface when the cart accepts new lines. */
  onAddToOrder?: (variantGid: string) => Promise<AddToOrderResult>;
};

function OfferProductRow({
  product,
  onAddToOrder,
}: {
  product: OfferProduct;
  onAddToOrder?: Props['onAddToOrder'];
}) {
  const [adding, setAdding] = useState(false);
  const [outcome, setOutcome] = useState<'idle' | 'added' | 'failed'>('idle');

  const showAddButton = Boolean(onAddToOrder) && product.availableForSale && outcome !== 'added';

  async function handleAdd() {
    if (!onAddToOrder || adding) return;
    setAdding(true);
    const result = await onAddToOrder(product.variantGid);
    setAdding(false);
    setOutcome(result === 'success' ? 'added' : 'failed');
  }

  return (
    <s-stack gap="small-200">
      <s-stack direction="inline" gap="base" alignItems="center">
        {product.imageUrl && (
          <s-product-thumbnail src={product.imageUrl} alt={product.imageAlt ?? product.title} size="base" />
        )}
        <s-stack gap="none">
          <s-text>{product.title}</s-text>
          {product.price && <s-text color="subdued">{product.price}</s-text>}
        </s-stack>
        {showAddButton && (
          <s-button variant="secondary" loading={adding} onClick={handleAdd}>
            Add to order
          </s-button>
        )}
      </s-stack>
      {outcome === 'added' && <s-text tone="success">Added to your order.</s-text>}
      {outcome === 'failed' && <s-text tone="critical">This item couldn't be added.</s-text>}
    </s-stack>
  );
}

export function CheckoutBlockRenderer({ offers, onAddToOrder }: Props) {
  if (offers.length === 0) return null;

  return (
    <s-stack gap="large-100">
      {offers.map((offer) => (
        <s-stack key={offer.key} gap="small-200">
          {offer.heading && <s-heading>{offer.heading}</s-heading>}
          {offer.message && <s-paragraph>{offer.message}</s-paragraph>}
          {offer.product && <OfferProductRow product={offer.product} onAddToOrder={onAddToOrder} />}
        </s-stack>
      ))}
    </s-stack>
  );
}

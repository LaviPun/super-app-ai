import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useCheckoutConfig } from '../hooks/useCheckoutConfig';
import { CheckoutBlockRenderer } from '../components/CheckoutBlockRenderer';

const TARGET = 'purchase.checkout.block.render';

function CheckoutBlock() {
  const result = useCheckoutConfig(TARGET);

  if (result.status === 'loading') return <s-text>Loading...</s-text>;
  if (result.status !== 'ready') return null;

  return <CheckoutBlockRenderer config={result.config} />;
}

export default async function extension() {
  render(<CheckoutBlock />, document.body);
}

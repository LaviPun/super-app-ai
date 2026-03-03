import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useBlockConfig } from '../hooks/useBlockConfig';
import { BlockRenderer } from '../components/BlockRenderer';

const TARGET = 'customer-account.order-index.block.render';

function OrderIndexBlock() {
  const result = useBlockConfig(TARGET);

  if (result.status === 'loading') {
    return (
      <s-stack gap="base">
        <s-text appearance="subdued">Loading...</s-text>
      </s-stack>
    );
  }

  if (result.status === 'error') {
    return (
      <s-stack gap="base">
        <s-badge tone="critical">Something went wrong loading this block.</s-badge>
      </s-stack>
    );
  }

  if (result.status !== 'ready') return null;

  return (
    <s-stack gap="base">
      <s-heading>{result.config.title}</s-heading>
      <BlockRenderer blocks={result.config.blocks} />
    </s-stack>
  );
}

export default async function extension() {
  render(<OrderIndexBlock />, document.body);
}

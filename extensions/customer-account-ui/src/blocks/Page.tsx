import React from 'react';
import { reactExtension, BlockStack, Heading, Text, Banner } from '@shopify/ui-extensions-react/customer-account';
import { useBlockConfig } from '../hooks/useBlockConfig';
import { BlockRenderer } from '../components/BlockRenderer';

const TARGET = 'customer-account.page.render';

export default reactExtension(TARGET, () => <SuperAppPage />);

function SuperAppPage() {
  const result = useBlockConfig(TARGET);

  if (result.status === 'loading') {
    return (
      <BlockStack spacing="base">
        <Text appearance="subdued">Loading...</Text>
      </BlockStack>
    );
  }

  if (result.status === 'error') {
    return (
      <BlockStack spacing="base">
        <Banner status="critical">Something went wrong loading this page.</Banner>
      </BlockStack>
    );
  }

  if (result.status !== 'ready') return null;

  const { config } = result;
  return (
    <BlockStack spacing="base">
      <Heading>{config.title}</Heading>
      <BlockRenderer blocks={config.blocks} />
    </BlockStack>
  );
}

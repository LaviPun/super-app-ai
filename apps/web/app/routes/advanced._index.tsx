import { Page, InlineGrid, Card, BlockStack, Text, Button, InlineStack, Icon } from '@shopify/polaris';
import { ConnectIcon, AutomationIcon } from '@shopify/polaris-icons';
import { useNavigate } from '@remix-run/react';

export default function AdvancedIndex() {
  const navigate = useNavigate();

  return (
    <Page
      title="Advanced features"
      subtitle="Connect external services and automate your store with workflows"
      backAction={{ content: 'Home', url: '/' }}
    >
      <InlineGrid columns={{ xs: 1, sm: 2 }} gap="500">
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Connectors</Text>
              <Text as="p" tone="subdued">
                Connect external APIs and services to your store. Use connectors in flows and modules
                to fetch or push data to third-party systems.
              </Text>
            </BlockStack>
            <InlineStack>
              <Button variant="primary" onClick={() => navigate('/connectors')}>
                Manage connectors
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Workflows</Text>
              <Text as="p" tone="subdued">
                Build automated workflows that run on a schedule or in response to Shopify events.
                Use flow steps to write to data stores, call connectors, and trigger actions.
              </Text>
            </BlockStack>
            <InlineStack>
              <Button variant="primary" onClick={() => navigate('/flows')}>
                Manage workflows
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </InlineGrid>
    </Page>
  );
}

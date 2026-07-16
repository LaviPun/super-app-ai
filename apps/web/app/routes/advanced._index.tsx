import type { LoaderFunctionArgs } from '@remix-run/node';
import { useNavigate } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { MerchantShell } from '~/components/merchant/MerchantShell';

export async function loader({ request }: LoaderFunctionArgs) {
  await shopify.authenticate.admin(request);
  return null;
}

export default function AdvancedIndex() {
  return (
    <MerchantShell polaris>
      <AdvancedBody />
    </MerchantShell>
  );
}

function AdvancedBody() {
  const navigate = useNavigate();

  return (
    <s-page heading="Advanced features" inlineSize="base">
      <s-stack gap="small-100">
        <s-stack direction="inline">
          <s-button variant="tertiary" icon="arrow-left" onClick={() => navigate('/')}>Home</s-button>
        </s-stack>
        <s-paragraph color="subdued">
          Connect external services and automate your store with workflows.
        </s-paragraph>
      </s-stack>

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap="base">
        <s-section heading="Connectors">
          <s-stack gap="base">
            <s-paragraph color="subdued">
              Connect external APIs and services to your store. Use connectors in flows and modules
              to fetch or push data to third-party systems.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button variant="primary" icon="connect" onClick={() => navigate('/connectors')}>
                Manage connectors
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>

        <s-section heading="Workflows">
          <s-stack gap="base">
            <s-paragraph color="subdued">
              Build automated workflows that run on a schedule or in response to Shopify events.
              Use flow steps to write to data stores, call connectors, and trigger actions.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button variant="primary" icon="automation" onClick={() => navigate('/flows')}>
                Manage workflows
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      </s-grid>
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';

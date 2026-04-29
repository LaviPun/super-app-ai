import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useAdminActions } from '../hooks/useAdminActions';
import { AdminBlockRenderer } from '../components/AdminBlockRenderer';

const TARGET = 'admin.customer-details.action.render';

function close() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).shopify?.extension?.api?.close?.();
}

function CustomerDetailsAction() {
  const state = useAdminActions(TARGET);

  return (
    <s-stack gap="base">
      {state.status === 'loading' && (
        <s-text appearance="subdued">Loading...</s-text>
      )}
      {state.status === 'error' && (
        <s-banner title="Error" tone="critical">
          <s-text>Failed to load SuperApp action configuration.</s-text>
        </s-banner>
      )}
      {state.status === 'hidden' && (
        <s-banner title="SuperApp" tone="info">
          <s-text>
            No action configured for customers. Publish an admin.action module targeting
            admin.customer-details.action.render from the SuperApp.
          </s-text>
        </s-banner>
      )}
      {state.status === 'ready' && (
        <AdminBlockRenderer
          block={{
            type: state.action.type,
            name: state.action.name,
            target: state.action.target,
            label: state.action.title || state.action.label,
            config: state.action.config,
          }}
        />
      )}
      <s-button onClick={close}>Close</s-button>
    </s-stack>
  );
}

export default async function extension() {
  render(<CustomerDetailsAction />, document.body);
}

import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useAdminActions } from '../hooks/useAdminActions';
import { AdminBlockRenderer } from '../components/AdminBlockRenderer';

const TARGET = 'admin.discount-index.selection-action.render';

function close() {
  // ActionExtensionApi exposes close() directly on the global shopify object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).shopify?.close?.();
}

function DiscountSelectionAction() {
  const state = useAdminActions(TARGET);
  const heading = state.status === 'ready' ? state.action.title || state.action.label || 'SuperApp' : 'SuperApp';

  return (
    <s-admin-action heading={heading}>
      <s-stack gap="base">
        {state.status === 'loading' && (
          <s-text color="subdued">Loading...</s-text>
        )}
        {state.status === 'error' && (
          <s-banner heading="Error" tone="critical">
            <s-text>Failed to load SuperApp action configuration.</s-text>
          </s-banner>
        )}
        {state.status === 'hidden' && (
          <s-banner heading="SuperApp" tone="info">
            <s-text>
              No action configured for the discounts bulk-action menu. Publish an admin.action
              module targeting admin.discount-index.selection-action.render from the SuperApp.
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
      </s-stack>
      <s-button slot="primary-action" onClick={close}>Close</s-button>
    </s-admin-action>
  );
}

export default async function extension() {
  render(<DiscountSelectionAction />, document.body);
}

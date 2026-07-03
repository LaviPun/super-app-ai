import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useMemo } from 'preact/hooks';
import { useDiscountUiConfig, type DiscountUiField } from './hooks/useDiscountUiConfig';

/**
 * SuperApp Discount Function Settings extension.
 *
 * Root element is `s-function-settings` (required for the
 * admin.discount-details.function-settings.render target). The form is generated from
 * the published admin.discountUi module config (fields[]), hydrated with the discount's
 * existing `$app/function-configuration` metafield value, and each named control is
 * serialized back into that metafield when the merchant saves — the shape the paired
 * discount Function reads at cart.lines.discounts.generate.run.
 */

const CONFIG_NAMESPACE = '$app';
const CONFIG_KEY = 'function-configuration';

/** Read the discount's existing saved configuration off the global shopify.data. */
function readExistingConfig(): Record<string, unknown> {
  const metafields = shopify?.data?.metafields ?? [];
  const mf = metafields.find((m) => m.namespace === CONFIG_NAMESPACE && m.key === CONFIG_KEY);
  if (!mf?.value) return {};
  try {
    const parsed = JSON.parse(mf.value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function FieldControl({ field, initial }: { field: DiscountUiField; initial: unknown }) {
  const defaultValue = initial == null ? '' : String(initial);
  // Each control's `name` becomes a key inside the serialized function-configuration
  // metafield; Shopify's function-settings form collects named inputs on save.
  switch (field.kind) {
    case 'number':
      return <s-number-field label={field.label} name={field.key} defaultValue={defaultValue} />;
    case 'toggle':
      return <s-checkbox label={field.label} name={field.key} defaultChecked={initial === true || initial === 'true'} />;
    case 'select':
      return (
        <s-select label={field.label} name={field.key} value={defaultValue}>
          <s-option value="">Select…</s-option>
        </s-select>
      );
    case 'text':
    default:
      return <s-text-field label={field.label} name={field.key} defaultValue={defaultValue} />;
  }
}

function DiscountFunctionSettings() {
  const state = useDiscountUiConfig();
  const existing = useMemo(readExistingConfig, []);

  if (state.status === 'loading') {
    return (
      <s-function-settings>
        <s-text color="subdued">Loading…</s-text>
      </s-function-settings>
    );
  }
  if (state.status === 'error') {
    return (
      <s-function-settings>
        <s-banner heading="SuperApp" tone="critical">
          <s-text>Failed to load discount settings configuration.</s-text>
        </s-banner>
      </s-function-settings>
    );
  }

  const { config } = state;
  return (
    <s-function-settings>
      <s-section heading={config.title}>
        <s-stack gap="base">
          {config.description ? <s-paragraph>{config.description}</s-paragraph> : null}
          {config.fields.length === 0 ? (
            <s-text color="subdued">No configurable fields for this discount.</s-text>
          ) : (
            config.fields.map((field) => (
              <FieldControl key={field.key} field={field} initial={existing[field.key]} />
            ))
          )}
          {config.functionHandle ? (
            <s-text color="subdued">Paired Function: {config.functionHandle}</s-text>
          ) : null}
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}

export default async function extension() {
  render(<DiscountFunctionSettings />, document.body);
}

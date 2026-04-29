/**
 * Renders a SuperApp checkout block dynamically.
 * Shows ALL config fields — no fields are filtered out.
 * Uses only s-stack, s-text, s-link (checkout-safe components).
 */
import type { CheckoutBlockConfig } from '../hooks/useCheckoutConfig';

type Props = { config: CheckoutBlockConfig };

function renderField(key: string, value: unknown): preact.JSX.Element | null {
  if (value == null) return null;

  const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

  if (typeof value === 'string' && (key.toLowerCase().includes('url') || key.toLowerCase().includes('link') || key.toLowerCase().includes('href'))) {
    return <s-link href={value}>{label}: {value}</s-link>;
  }

  if (Array.isArray(value)) {
    return (
      <s-stack gap="base">
        <s-text>{label}:</s-text>
        {value.map((item, i) => (
          <s-text key={i}>• {typeof item === 'object' ? JSON.stringify(item) : String(item)}</s-text>
        ))}
      </s-stack>
    );
  }

  if (typeof value === 'object') {
    return (
      <s-stack gap="base">
        <s-text>{label}:</s-text>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <s-text key={k}>{k}: {v == null ? '—' : String(v)}</s-text>
        ))}
      </s-stack>
    );
  }

  return <s-text>{label}: {String(value)}</s-text>;
}

export function CheckoutBlockRenderer({ config }: Props) {
  const entries = Object.entries(config);

  return (
    <s-stack gap="base">
      {entries.length === 0 && <s-text>No configuration fields found.</s-text>}
      {entries.map(([key, value]) => renderField(key, value))}
    </s-stack>
  );
}

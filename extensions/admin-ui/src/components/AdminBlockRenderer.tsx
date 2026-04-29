/**
 * Renders a generic admin block from the SuperApp module config.
 * Shows ALL config fields dynamically — no fields are filtered out.
 * Uses Polaris web components (s-*) for 64 KB bundle.
 */
import type { AdminBlockConfig } from '../hooks/useAdminBlocks';

type Props = { block: AdminBlockConfig };

function renderField(key: string, value: unknown): preact.JSX.Element | null {
  if (value == null) return null;

  const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

  if (typeof value === 'boolean') {
    return (
      <s-inline gap="tight">
        <s-text fontWeight="bold">{label}:</s-text>
        <s-badge tone={value ? 'success' : 'critical'}>{value ? 'Yes' : 'No'}</s-badge>
      </s-inline>
    );
  }

  if (typeof value === 'string' && (key.toLowerCase().includes('url') || key.toLowerCase().includes('link') || key.toLowerCase().includes('href'))) {
    return (
      <s-inline gap="tight">
        <s-text fontWeight="bold">{label}:</s-text>
        <s-link href={value}>{value}</s-link>
      </s-inline>
    );
  }

  if (Array.isArray(value)) {
    return (
      <s-stack gap="tight">
        <s-text fontWeight="bold">{label}:</s-text>
        {value.map((item, i) => (
          <s-text key={i}>• {typeof item === 'object' ? JSON.stringify(item) : String(item)}</s-text>
        ))}
      </s-stack>
    );
  }

  if (typeof value === 'object') {
    return (
      <s-stack gap="tight">
        <s-text fontWeight="bold">{label}:</s-text>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <s-text key={k}>  {k}: {v == null ? '—' : String(v)}</s-text>
        ))}
      </s-stack>
    );
  }

  return (
    <s-inline gap="tight">
      <s-text fontWeight="bold">{label}:</s-text>
      <s-text>{String(value)}</s-text>
    </s-inline>
  );
}

export function AdminBlockRenderer({ block }: Props) {
  const entries = Object.entries(block.config);

  return (
    <s-stack gap="base">
      <s-text fontWeight="bold">{block.label || block.name}</s-text>
      <s-separator />
      {entries.length === 0 && (
        <s-text appearance="subdued">No configuration fields found.</s-text>
      )}
      {entries.map(([key, value]) => renderField(key, value))}
    </s-stack>
  );
}

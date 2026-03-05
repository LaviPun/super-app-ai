/**
 * Truncates text for index tables; full content on hover via title (native tooltip).
 * Use for Message, Path, Error, Details, Resource, etc. so long content doesn't break layout.
 */
import { Text } from '@shopify/polaris';

const DEFAULT_MAX_LEN = 120;
const DEFAULT_MAX_WIDTH_PX = 280;

type Props = {
  value: string | null | undefined;
  maxLength?: number;
  maxWidthPx?: number;
  tone?: 'subdued' | 'critical' | 'caution';
};

export function InternalTruncateCell({
  value,
  maxLength = DEFAULT_MAX_LEN,
  maxWidthPx = DEFAULT_MAX_WIDTH_PX,
  tone,
}: Props) {
  const text = value ?? '';
  const isEmpty = text === '';
  const display = isEmpty ? '—' : (text.length > maxLength ? text.slice(0, maxLength) + '…' : text);

  if (isEmpty) return <Text as="span" variant="bodySm" tone="subdued">—</Text>;

  return (
    <span
      title={text}
      style={{
        maxWidth: maxWidthPx,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'inline-block',
        verticalAlign: 'bottom',
      }}
    >
      <Text as="span" variant="bodySm" tone={tone}>
        {display}
      </Text>
    </span>
  );
}

/**
 * Renders blocks using Polaris web components (s-*). 2026-01 / 64 KB friendly.
 */
import type { BlockDef } from '../hooks/useBlockConfig';

type Props = { blocks: BlockDef[] };

export function BlockRenderer({ blocks }: Props) {
  return (
    <s-stack gap="base">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'TEXT':
            return <s-text key={i}>{block.content ?? ''}</s-text>;
          case 'LINK':
            return (
              <s-link key={i} href={block.url ?? '#'}>
                {block.content ?? block.url ?? 'Link'}
              </s-link>
            );
          case 'BADGE':
            return (
              <s-badge key={i} tone={block.tone ?? 'info'}>
                {block.content ?? ''}
              </s-badge>
            );
          case 'DIVIDER':
            return <s-separator key={i} />;
          default:
            return null;
        }
      })}
    </s-stack>
  );
}

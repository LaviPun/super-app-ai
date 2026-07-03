import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {usePosConfig} from './usePosConfig.js';

/**
 * Receipt header / footer block. Print surfaces support only text-oriented components,
 * so this renders the published `receiptText` (or `label`) for each block scoped to the
 * active receipt target — a promo line, return policy, survey URL, etc. Config-driven:
 * the shipped block reads PUBLISHED pos.extension config from /api/pos/config. When no
 * receipt module is published, nothing prints.
 */
export default async (api) => {
  render(<Extension target={api?.target} />, document.body);
};

function Extension({target}) {
  const result = usePosConfig(target ?? '');
  if (result.status !== 'ready' || result.blocks.length === 0) {
    return null;
  }
  return (
    <s-stack direction="block" gap="small">
      {result.blocks.map((block) => (
        <s-text key={block.moduleId}>
          {block.actionConfig?.receiptText || block.label}
        </s-text>
      ))}
    </s-stack>
  );
}

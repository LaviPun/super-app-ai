import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {usePosConfig} from './usePosConfig.js';

const TARGET = 'pos.product-details.block.render';

export default async () => {
  render(<Extension />, document.body);
};

export function Extension() {
  const {i18n} = shopify;
  const result = usePosConfig(TARGET);

  if (result.status === 'loading') {
    return (
      <s-pos-block heading={i18n.translate('block_heading')}>
        <s-box padding="large">
          <s-text>{i18n.translate('loading')}</s-text>
        </s-box>
      </s-pos-block>
    );
  }

  if (result.status === 'error') {
    return (
      <s-pos-block heading={i18n.translate('block_heading')}>
        <s-box padding="large">
          <s-badge tone="critical">{i18n.translate('load_error')}</s-badge>
        </s-box>
      </s-pos-block>
    );
  }

  // Empty state: no published POS module config for this shop yet.
  if (result.blocks.length === 0) {
    return (
      <s-pos-block heading={i18n.translate('block_heading')}>
        <s-box padding="large">
          <s-text>{i18n.translate('empty_state')}</s-text>
        </s-box>
      </s-pos-block>
    );
  }

  // Render the real, published config. The first block published to this target
  // drives the heading/label; its companion modal opens via the action.
  const primary = result.blocks[0];

  return (
    <s-pos-block heading={primary.name || i18n.translate('block_heading')}>
      <s-button
        slot="secondary-actions"
        onClick={() => shopify.action.presentModal()}
      >
        {primary.label || i18n.translate('open_action')}
      </s-button>
      <s-box padding="large">
        <s-stack direction="block" gap="base">
          {result.blocks.map((block) => (
            <s-text key={block.moduleId}>{block.label}</s-text>
          ))}
        </s-stack>
      </s-box>
    </s-pos-block>
  );
}

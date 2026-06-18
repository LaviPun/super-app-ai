import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {usePosConfig} from './usePosConfig.js';

const TARGET = 'pos.product-details.action.render';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const {i18n} = shopify;
  const result = usePosConfig(TARGET);

  if (result.status === 'loading') {
    return (
      <s-page heading={i18n.translate('action_heading')}>
        <s-scroll-box>
          <s-box padding="small">
            <s-text>{i18n.translate('loading')}</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (result.status === 'error') {
    return (
      <s-page heading={i18n.translate('action_heading')}>
        <s-scroll-box>
          <s-box padding="small">
            <s-badge tone="critical">{i18n.translate('load_error')}</s-badge>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (result.blocks.length === 0) {
    return (
      <s-page heading={i18n.translate('action_heading')}>
        <s-scroll-box>
          <s-box padding="small">
            <s-text>{i18n.translate('empty_state')}</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  // Render the real published config for this POS surface.
  return (
    <s-page heading={result.blocks[0].name || i18n.translate('action_heading')}>
      <s-scroll-box>
        <s-stack direction="block" gap="base">
          {result.blocks.map((block) => (
            <s-section key={block.moduleId} heading={block.name}>
              <s-box padding="small">
                <s-text>{block.label}</s-text>
              </s-box>
            </s-section>
          ))}
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}

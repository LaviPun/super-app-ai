import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {usePosConfig} from './usePosConfig.js';
import {resolveBinding} from './posBehavior.js';

/**
 * Inline details BLOCK — a persistent info section inside a native POS details screen.
 * Mounted at every `*.block.render` target (product / customer / order / draft-order /
 * register / purchase / return / exchange post). Config-driven: reads the shop's
 * PUBLISHED pos.extension config for the ACTIVE target and renders each block's live
 * `binding` (falling back to its literal `label`). A block that pairs with a modal
 * exposes a secondary action that presents it. No per-module code.
 */
export default async (api) => {
  render(<Extension target={api?.target} />, document.body);
};

export function Extension({target}) {
  const {i18n} = shopify;
  const result = usePosConfig(target ?? '');

  if (result.status === 'loading') {
    return (
      <s-pos-block heading={i18n.translate('block_heading')}>
        <s-box padding="large"><s-text>{i18n.translate('loading')}</s-text></s-box>
      </s-pos-block>
    );
  }
  if (result.status === 'error') {
    return (
      <s-pos-block heading={i18n.translate('block_heading')}>
        <s-box padding="large"><s-badge tone="critical">{i18n.translate('load_error')}</s-badge></s-box>
      </s-pos-block>
    );
  }
  if (result.blocks.length === 0) {
    return (
      <s-pos-block heading={i18n.translate('block_heading')}>
        <s-box padding="large"><s-text>{i18n.translate('empty_state')}</s-text></s-box>
      </s-pos-block>
    );
  }

  const primary = result.blocks[0];
  const hasModalPair = primary.presentation === 'MENUITEM_ACTION' || primary.presentation === 'TILE_MODAL' || primary.action === 'PRESENT_MODAL';

  return (
    <s-pos-block heading={primary.name || i18n.translate('block_heading')}>
      {hasModalPair ? (
        <s-button slot="secondary-actions" onClick={() => shopify.action?.presentModal?.()}>
          {primary.label || i18n.translate('open_action')}
        </s-button>
      ) : null}
      <s-box padding="large">
        <s-stack direction="block" gap="base">
          {result.blocks.map((block) => (
            <s-text key={block.moduleId}>
              {resolveBinding(block.binding) || block.label}
            </s-text>
          ))}
        </s-stack>
      </s-box>
    </s-pos-block>
  );
}

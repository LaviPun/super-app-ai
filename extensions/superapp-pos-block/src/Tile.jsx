import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {usePosConfig} from './usePosConfig.js';
import {resolveBinding} from './posBehavior.js';

const TARGET = 'pos.home.tile.render';

export default async () => {
  render(<Extension />, document.body);
};

/**
 * POS home smart-grid tile. Config-driven: reads the shop's PUBLISHED pos.extension
 * config and renders a tile whose tap presents the companion modal
 * (`pos.home.modal.render`) via the Action API — the tile↔modal pairing. When no
 * home tile is published, the tile stays disabled with an empty-state subtitle.
 */
function Extension() {
  const {i18n} = shopify;
  const result = usePosConfig(TARGET);

  const primary = result.status === 'ready' ? result.blocks[0] : undefined;
  const enabled = Boolean(primary);
  const title = primary?.label || i18n.translate('block_heading');
  const subtitle = primary
    ? resolveBinding(primary.binding) || primary.name
    : i18n.translate('empty_state');

  return (
    <s-pos-tile
      title={title}
      subtitle={subtitle}
      enabled={enabled}
      onPress={() => shopify.action?.presentModal?.()}
    />
  );
}

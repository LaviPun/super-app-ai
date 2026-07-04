import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {usePosConfig} from './usePosConfig.js';

/**
 * The action MENU-ITEM surface — the trigger half of the menu-item↔action pairing.
 * Mounted at every `*.action.menu-item.render` target (product / customer / cart
 * line-item / order / draft-order / register / purchase / return / exchange). It
 * renders a single button that presents the companion `*.action.render` modal via
 * `shopify.action.presentModal()`. One generic entry serves every surface — the
 * target string (read by usePosConfig) scopes which published block drives the label.
 *
 * `pos-target` is read at runtime by usePosConfig via the extension api; the module
 * is registered against multiple targets in the toml, so we resolve the active
 * target from the extension target rather than hard-coding one.
 */
export default async (api) => {
  render(<Extension target={api?.target} />, document.body);
};

function Extension({target}) {
  const {i18n} = shopify;
  // Fall back to a broad menu-item read when the runtime target isn't provided.
  const result = usePosConfig(target ?? '');

  const primary =
    result.status === 'ready' && result.blocks.length > 0 ? result.blocks[0] : undefined;
  const label = primary?.label || i18n.translate('open_action');

  return (
    <s-button
      title={label}
      onPress={() => shopify.action?.presentModal?.()}
    >
      {label}
    </s-button>
  );
}

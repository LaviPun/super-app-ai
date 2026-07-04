import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {useState} from 'preact/hooks';
import {usePosConfig} from './usePosConfig.js';
import {resolveBinding, runAction} from './posBehavior.js';

/**
 * The full-screen MODAL / ACTION surface — the companion half of the tile↔modal and
 * menu-item↔action pairings. Mounted at `pos.home.modal.render` and every
 * `*.action.render` target. Renders each published block for the active surface and,
 * when a block declares an `action`, exposes a button that runs it via the config-driven
 * behavior pack (discounts, notes, loyalty read/write, cart mutation, print, navigation),
 * gated by a staff PIN when required. Bindings render live values; anything unresolvable
 * degrades to the block's literal label.
 */
export default async (api) => {
  render(<Extension target={api?.target} />, document.body);
};

function Extension({target}) {
  const {i18n} = shopify;
  const result = usePosConfig(target ?? '');

  if (result.status === 'loading') {
    return (
      <s-page heading={i18n.translate('action_heading')}>
        <s-scroll-box>
          <s-box padding="small"><s-text>{i18n.translate('loading')}</s-text></s-box>
        </s-scroll-box>
      </s-page>
    );
  }
  if (result.status === 'error') {
    return (
      <s-page heading={i18n.translate('action_heading')}>
        <s-scroll-box>
          <s-box padding="small"><s-badge tone="critical">{i18n.translate('load_error')}</s-badge></s-box>
        </s-scroll-box>
      </s-page>
    );
  }
  if (result.blocks.length === 0) {
    return (
      <s-page heading={i18n.translate('action_heading')}>
        <s-scroll-box>
          <s-box padding="small"><s-text>{i18n.translate('empty_state')}</s-text></s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  return (
    <s-page heading={result.blocks[0].name || i18n.translate('action_heading')}>
      <s-scroll-box>
        <s-stack direction="block" gap="base">
          {result.blocks.map((block) => (
            <BlockSection key={block.moduleId} block={block} i18n={i18n} />
          ))}
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}

function BlockSection({block, i18n}) {
  const [busy, setBusy] = useState(false);
  const bound = resolveBinding(block.binding);
  const hasAction = block.action && block.action !== 'NONE' && block.action !== 'PRESENT_MODAL';

  async function onPress() {
    setBusy(true);
    try {
      await runAction(block);
    } finally {
      setBusy(false);
    }
  }

  return (
    <s-section heading={block.name}>
      <s-box padding="small">
        <s-stack direction="block" gap="small">
          <s-text>{bound || block.label}</s-text>
          {block.staffPin?.required ? (
            <s-badge tone="warning">{i18n.translate('pin_gated')}</s-badge>
          ) : null}
          {hasAction ? (
            <s-button loading={busy} onPress={onPress}>
              {block.label}
            </s-button>
          ) : null}
        </s-stack>
      </s-box>
    </s-section>
  );
}

/**
 * Shared mount for every customer-account target. The generic customer-account UI
 * extension registers ONE renderer at all ~23 targets; each per-target module file
 * is a one-line `mountCaTarget(TARGET)` call. This keeps the extension truly
 * config-driven — no per-target code, only a target string that selects surface
 * behavior:
 *   • order.action.menu-item.render → a single s-button (the action trigger)
 *   • order.action.render          → an s-customer-account-action modal overlay
 *   • everything else              → the generic BlockRenderer (title + blocks)
 *
 * Content comes from the published `$app:superapp_customer_account_block`
 * metaobject via `useBlockConfig`; live-data bindings are resolved there.
 */
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useBlockConfig } from '../hooks/useBlockConfig';
import { BlockRenderer } from '../components/BlockRenderer';
import type { CaBlock } from '../lib/ca-content';

/** Find the first ACTION block in a config, if any. */
function actionBlock(blocks: CaBlock[]): CaBlock | undefined {
  return blocks.find((b) => b.kind === 'ACTION');
}

/** The order.action MENU-ITEM: renders a single button that opens the action. */
function MenuItemTarget({ target }: { target: string }) {
  const result = useBlockConfig(target);
  if (result.status !== 'ready') return null;
  const action = actionBlock(result.config.blocks);
  const label = action?.content ?? result.config.title ?? 'Action';
  // A `link` action navigates directly (href); a `modal` action omits href so the
  // click opens the paired order.action.render modal.
  const href = action?.action === 'link' ? action.url : undefined;
  return <s-button href={href}>{label}</s-button>;
}

/** The order.action ACTION overlay: an s-customer-account-action modal. */
function ActionTarget({ target }: { target: string }) {
  const result = useBlockConfig(target);
  if (result.status !== 'ready') return null;
  const action = actionBlock(result.config.blocks);
  const heading = result.config.title || action?.content || 'Action';
  return (
    <s-customer-account-action heading={heading}>
      <BlockRenderer
        blocks={result.config.blocks.filter((b) => b.kind !== 'ACTION')}
        bound={result.config.bound}
      />
    </s-customer-account-action>
  );
}

/** The generic block surface: heading + rendered blocks. */
function GenericTarget({ target }: { target: string }) {
  const result = useBlockConfig(target);
  if (result.status === 'loading') {
    return (
      <s-stack gap="base">
        <s-text color="subdued">Loading...</s-text>
      </s-stack>
    );
  }
  if (result.status === 'error') {
    return (
      <s-stack gap="base">
        <s-badge tone="critical">Something went wrong loading this block.</s-badge>
      </s-stack>
    );
  }
  if (result.status !== 'ready') return null;
  return (
    <s-stack gap="base">
      {result.config.title && <s-heading>{result.config.title}</s-heading>}
      <BlockRenderer blocks={result.config.blocks} bound={result.config.bound} />
    </s-stack>
  );
}

/** Render the generic customer-account renderer for a specific target. */
export function mountCaTarget(target: string): void {
  function Target() {
    if (target === 'customer-account.order.action.menu-item.render') {
      return <MenuItemTarget target={target} />;
    }
    if (target === 'customer-account.order.action.render') {
      return <ActionTarget target={target} />;
    }
    return <GenericTarget target={target} />;
  }
  render(<Target />, document.body);
}

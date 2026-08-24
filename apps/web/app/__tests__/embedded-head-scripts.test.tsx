/**
 * App Store requirement: app-bridge.js must load from the CDN in <head>,
 * configured via the shopify-api-key meta tag, BEFORE polaris.js (Polaris
 * web components integrate with App Bridge). app-bridge.js must not be
 * deferred; polaris.js keeps defer.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmbeddedHeadScripts } from '~/components/EmbeddedHeadScripts';

describe('EmbeddedHeadScripts', () => {
  const html = renderToStaticMarkup(<EmbeddedHeadScripts apiKey="test-key-123" />);

  it('renders the api-key meta tag before the app-bridge script', () => {
    const meta = html.indexOf('name="shopify-api-key"');
    const appBridge = html.indexOf('https://cdn.shopify.com/shopifycloud/app-bridge.js');
    expect(meta).toBeGreaterThan(-1);
    expect(appBridge).toBeGreaterThan(-1);
    expect(meta).toBeLessThan(appBridge);
    expect(html).toContain('content="test-key-123"');
  });

  it('loads app-bridge.js before polaris.js', () => {
    const appBridge = html.indexOf('shopifycloud/app-bridge.js');
    const polaris = html.indexOf('shopifycloud/polaris.js');
    expect(polaris).toBeGreaterThan(appBridge);
  });

  it('does not defer app-bridge.js (must configure before other scripts run)', () => {
    const appBridgeTag = html.slice(
      html.indexOf('<script', html.indexOf('app-bridge.js') - 200),
      html.indexOf('app-bridge.js') + 'app-bridge.js"></script>'.length,
    );
    expect(appBridgeTag).not.toContain('defer');
  });
});

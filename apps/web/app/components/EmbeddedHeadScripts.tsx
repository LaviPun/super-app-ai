/**
 * Head scripts for the embedded (Shopify admin) surface.
 * Order matters and is an App Store requirement:
 *   1. shopify-api-key meta   — configures App Bridge
 *   2. app-bridge.js          — must be in <head>, not deferred, before other scripts
 *   3. polaris.js (defer)     — defines the s-* web components; integrates with App Bridge
 * Replaces the <script> that @shopify/shopify-app-remix's AppProvider used to
 * inject into <body> (wrong location per the 2025-10-15 App Store requirement).
 */
export function EmbeddedHeadScripts({ apiKey }: { apiKey: string }) {
  return (
    <>
      <meta name="shopify-api-key" content={apiKey} />
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      <script src="https://cdn.shopify.com/shopifycloud/polaris.js" defer />
    </>
  );
}

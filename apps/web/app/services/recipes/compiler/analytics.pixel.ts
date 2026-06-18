import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

/**
 * analytics.pixel deploys as a real Shopify Web Pixel: PublishService upserts the
 * pixel via webPixelCreate/Update with these settings, and the shipped
 * `extensions/superapp-web-pixel` subscribes to storefront events at runtime.
 *
 * The web pixel's settings schema declares `accountID` (single line text). We map
 * the module's configured account id (or fall back to a stable per-module id) so
 * the pixel always has valid settings to register with.
 */
export function compileAnalyticsPixel(spec: Extract<RecipeSpec, { type: 'analytics.pixel' }>): CompileResult {
  const config = (spec.config ?? {}) as Record<string, unknown>;
  const accountID =
    (typeof config.accountId === 'string' && config.accountId) ||
    (typeof config.accountID === 'string' && config.accountID) ||
    `superapp-${spec.name.toLowerCase().replace(/\s+/g, '-')}`;

  return {
    ops: [
      { kind: 'WEB_PIXEL_UPSERT', settings: { accountID } },
      { kind: 'AUDIT', action: 'compile.analytics.pixel' },
    ],
    compiledJson: JSON.stringify({ webPixel: { accountID } }),
  };
}

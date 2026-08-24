import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WS-H Task 4 placeholder-media fix. Ports PreviewService.isPlaceholderUrl()/
 * phMedia()/PH_SVG (apps/web/app/services/preview/preview.service.ts:3430-3454)
 * into a reusable Liquid snippet so a template's demo cdn.example.com URLs — or
 * Shopify's own illustrative cdn.shopify.com/s/files/ library assets — never
 * render a broken <img> on a real storefront. Static-content test (no Liquid
 * execution needed here; Task 8 adds real rendering).
 */

const REPO_ROOT = join(__dirname, '../../../..');
const SRC = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid');

describe('shared media-placeholder partial (WS-H placeholder-media fix)', () => {
  it('superapp-module-media.liquid exists and checks for example.com / cdn.shopify.com/s/files/', () => {
    const partial = readFileSync(join(SRC, 'snippets/superapp-module-media.liquid'), 'utf8');
    expect(partial).toMatch(/example\.com/);
    expect(partial).toMatch(/cdn\.shopify\.com\/s\/files\//);
  });

  it('no remaining raw <img src="{{ ...ImageUrl... }}"> emission outside the shared partial', () => {
    const family = ['superapp-module-sections.liquid', 'superapp-module-pdp.liquid', 'superapp-module-overlay.liquid']
      .map((f) => readFileSync(join(SRC, 'snippets', f), 'utf8'))
      .join('\n');
    // Every raw <img> tag whose src references a *ImageUrl config field directly
    // (not routed through the partial) is the bug this task fixes.
    const rawImgWithConfigUrl = /<img[^>]*src="\{\{[^}]*ImageUrl[^}]*\}\}/g;
    expect(family.match(rawImgWithConfigUrl)).toBeNull();
  });
});

import { readFileSync, readdirSync } from 'node:fs';
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
const SNIPPETS = join(SRC, 'snippets');
const PARTIAL_FILE = 'superapp-module-media.liquid';

/**
 * Every raw <img ...> tag emitted directly by a snippet OTHER than the shared
 * partial itself is a placeholder-detection gap, UNLESS its src goes through
 * Shopify's `image_url` filter — that filter only ever applies to genuine
 * Shopify-hosted store data (product.featured_image / p.featured_image), never
 * to template-authored demo config, so it never needs placeholder detection.
 */
function rawUnroutedImgTags(content: string): string[] {
  // Require a src= attribute — an `<img>` mentioned bare in a {% # ... %} doc
  // comment (e.g. "falls through to the original <img>") is prose, not markup.
  const tags = content.match(/<img\b[^>]*\bsrc=[^>]*>/g) ?? [];
  return tags.filter((tag) => !tag.includes('image_url'));
}

describe('shared media-placeholder partial (WS-H placeholder-media fix)', () => {
  it('superapp-module-media.liquid exists and checks for example.com / cdn.shopify.com/s/files/', () => {
    const partial = readFileSync(join(SNIPPETS, PARTIAL_FILE), 'utf8');
    expect(partial).toMatch(/example\.com/);
    expect(partial).toMatch(/cdn\.shopify\.com\/s\/files\//);
  });

  it('superapp-module-media.liquid escapes its src attribute (no raw url interpolation — attribute injection guard)', () => {
    const partial = readFileSync(join(SNIPPETS, PARTIAL_FILE), 'utf8');
    expect(partial).toMatch(/src="\{\{\s*url\s*\|\s*escape\s*\}\}"/);
  });

  it('no remaining raw <img src="{{ ...ImageUrl... }}"> emission outside the shared partial', () => {
    const family = ['superapp-module-sections.liquid', 'superapp-module-pdp.liquid', 'superapp-module-overlay.liquid']
      .map((f) => readFileSync(join(SNIPPETS, f), 'utf8'))
      .join('\n');
    // Every raw <img> tag whose src references a *ImageUrl config field directly
    // (not routed through the partial) is the bug this task fixes.
    const rawImgWithConfigUrl = /<img[^>]*src="\{\{[^}]*ImageUrl[^}]*\}\}/g;
    expect(family.match(rawImgWithConfigUrl)).toBeNull();
  });

  it('no unrouted config-driven <img> anywhere under theme-extension-src/liquid/snippets (whole-tree sweep, fix round 1 — covers superapp-module.liquid banner + superapp-product-bundle.liquid component images, previously dormant gaps)', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(SNIPPETS).filter((f) => f.endsWith('.liquid'))) {
      if (file === PARTIAL_FILE) continue; // the partial's own <img> is the routed target, not a caller
      const content = readFileSync(join(SNIPPETS, file), 'utf8');
      for (const tag of rawUnroutedImgTags(content)) {
        offenders.push(`${file}: ${tag}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

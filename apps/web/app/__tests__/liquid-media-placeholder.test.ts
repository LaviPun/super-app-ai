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

/**
 * CLS restoration (binding follow-up to the WS-H Task 5 byte reclaim). The shared
 * partial's real-<img> branch emits width/height (passed through from the caller);
 * every one of the ~21 call sites across the renderer family now passes the
 * pre-a540c7a dimensions back in, so the ImgWidthAndHeight theme-check offense (and
 * the CLS regression it was flagging) is gone — not silenced.
 *
 * The width/height attributes are written UNCONDITIONALLY on the <img> tag rather
 * than behind an {% if width != blank %} guard: Shopify's real ImgWidthAndHeight
 * rule inspects the parsed HTML/Liquid AST for a literal attribute NODE and does
 * not recognize one wrapped in a Liquid conditional as present, even when every
 * real call site supplies a value (confirmed empirically against
 * @shopify/theme-check-node — the conditional form flagged a real ERROR-severity
 * offense with 21/21 call sites passing width+height). An omitted width/height
 * still degrades gracefully (browsers ignore an empty width=""/height=""), so the
 * params stay genuinely optional in practice while satisfying the linter's static
 * shape requirement.
 */
describe('superapp-module-media.liquid width/height (CLS restoration)', () => {
  const partial = readFileSync(join(SNIPPETS, PARTIAL_FILE), 'utf8');

  it('emits width/height as unconditional attributes on the real <img> branch (theme-check needs the attribute NODE present, not just a conditionally-true value)', () => {
    expect(partial).toMatch(/<img[^>]*\bwidth="\{\{\s*width\s*\}\}"/);
    expect(partial).toMatch(/<img[^>]*\bheight="\{\{\s*height\s*\}\}"/);
  });

  it('the ImgWidthAndHeight theme-check-disable is gone — every call site now carries real dimensions', () => {
    expect(partial).not.toMatch(/theme-check-disable[^%]*ImgWidthAndHeight/);
  });

  it('every superapp-module-media render call across the renderer family passes width and height', () => {
    const family = ['superapp-module-sections.liquid', 'superapp-module-pdp.liquid', 'superapp-module-overlay.liquid', 'superapp-module.liquid', 'superapp-product-bundle.liquid']
      .map((f) => readFileSync(join(SNIPPETS, f), 'utf8'))
      .join('\n');
    const calls = family.match(/\{%\s*render\s*'superapp-module-media'[^%]*%\}/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(20); // ~21 call sites per the WS-H plan
    const missing = calls.filter((c) => !/\bwidth:/.test(c) || !/\bheight:/.test(c));
    expect(missing).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService, BADGE_ICON_PREVIEW_IDS } from '~/services/preview/preview.service';
import { BADGE_ICON_IDS } from '~/services/recipes/kind-archetype';

/**
 * V-A A2 — trust/payment badge-icon catalog single-source contract.
 *
 * The icon id list lives in ONE place (`BADGE_ICON_IDS` in kind-archetype).
 *
 * WS-H Task 5 (Liquid byte reclaim) — corrected in the fix-round-1 pass: the
 * storefront no longer hand-authors an inline `<svg><symbol id="sa-ico-<id>">`
 * sprite in Liquid — that ~2 KB catalog never varies per merchant/config, so it
 * moved to `superapp-modules.css` as `.superapp-trust__ico[data-sa-icon="<id>"] {
 * mask-image: ...; }` rules (CSS has a separate, uncontested budget from the
 * Shopify-enforced 100 KB aggregate Liquid wall; see
 * scripts/build-theme-liquid.mjs). The storefront Liquid now emits a
 * `data-sa-icon="<id>"` attribute instead of a `<use href="#sa-ico-<id>">`
 * reference. `PreviewService` was updated to match (R0 parity, fix round 1) — it
 * no longer hand-authors its own inline-SVG mirror; it emits the SAME
 * `data-sa-icon`-attributed `<span>` and the SAME `superapp-trust__ico[--glyph]`
 * classes the storefront computes, so preview and storefront resolve the glyph
 * through the literal same CSS rule (see `preview-icon-css-parity.test.ts` for
 * the standing class↔selector coverage guard).
 *
 * CSS/JS assets have a proper readable SOURCE — `apps/web/theme-extension-src/
 * superapp-modules.src.{css,js}` — rebuilt into `extensions/theme-app-extension/
 * assets/superapp-modules.{css,js}` via esbuild --minify (see each source file's
 * own header for the exact command). This test checks the SHIPPED file (what a
 * real storefront actually loads), quote-tolerant since esbuild's CSS minifier
 * drops attribute-selector quotes when they're not needed (`data-sa-icon=visa`
 * is valid CSS, identical to `data-sa-icon="visa"`).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../../..');
const CSS_ASSET = join(REPO_ROOT, 'extensions/theme-app-extension/assets/superapp-modules.css');

/** Extract `data-sa-icon="<id>"` (or unquoted) attribute-selector ids from the CSS mask catalog. */
function cssIconIds(css: string): string[] {
  const ids = new Set<string>();
  for (const m of css.matchAll(/\.superapp-trust__ico\[data-sa-icon=['"]?([a-z0-9-]+)['"]?\]/g)) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}

describe('badge-icon catalog — single-source id parity (A2)', () => {
  const canonical = [...BADGE_ICON_IDS].sort();

  it('guards a non-trivial catalog (payment + trust)', () => {
    expect(BADGE_ICON_IDS.length).toBe(16);
  });

  it('the storefront CSS mask catalog covers exactly the canonical id set (WS-H Task 5: moved out of the Liquid sprite)', () => {
    expect(cssIconIds(readFileSync(CSS_ASSET, 'utf8')).sort()).toEqual(canonical);
  });

  it('the PreviewService catalog covers exactly the canonical id set', () => {
    expect([...BADGE_ICON_PREVIEW_IDS].sort()).toEqual(canonical);
  });
});

describe('badge-icon rendering in the trust preview (A2)', () => {
  const service = new PreviewService();
  const html = (blocks: Array<{ kind: string; text?: string; fields?: Record<string, unknown> }>): string => {
    const spec = {
      type: 'theme.section',
      name: 'Badges',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'trust-badges', activation: 'section', title: 'Trust', subtitle: '', fields: {}, blocks },
      placement: { enabled_on: { templates: ['product'] } },
    } as unknown as RecipeSpec;
    const r = service.render(spec);
    return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
  };

  it('renders a payment icon as a data-sa-icon span (no --glyph modifier, matching the storefront\'s wide/short pay box) — R0 fix round 1', () => {
    const out = html([{ kind: 'badge', text: 'Visa', fields: { icon: 'visa' } }]);
    expect(out).toContain('data-sa-icon="visa"');
    expect(out).toContain('class="superapp-trust__ico"'); // exact match: no --glyph, no --pay (removed with the sprite)
    expect(out).toContain('superapp-trust__badge--icon');
    expect(out).not.toContain('>VISA<'); // the glyph is drawn by CSS now, not inline SVG text
  });

  it('renders a trust glyph as a data-sa-icon span with the --glyph size modifier — R0 fix round 1', () => {
    const out = html([{ kind: 'badge', text: 'Secure checkout', fields: { icon: 'secure-checkout' } }]);
    expect(out).toContain('data-sa-icon="secure-checkout"');
    expect(out).toContain('class="superapp-trust__ico superapp-trust__ico--glyph"');
    expect(out).not.toContain('<path'); // the glyph is drawn by CSS now, not an inline <svg><path>
  });

  it('falls back to the plain badge (no catalog icon) for an unknown/absent icon', () => {
    const out = html([{ kind: 'badge', text: 'Handmade', fields: { icon: 'not-a-real-icon' } }]);
    // No catalog <span data-sa-icon="…"> is emitted for this badge. (The page DOES
    // contain the substring "data-sa-icon" elsewhere — the inlined real
    // superapp-modules.css carries the full [data-sa-icon="<id>"] mask catalog as
    // plain stylesheet text regardless of what this one badge renders — so the
    // assertion must be scoped to this badge's own attribute value, not the page.)
    expect(out).not.toContain('data-sa-icon="not-a-real-icon"');
    expect(out).not.toContain('class="superapp-trust__ico');
    // The pre-A2 badge path (glyph fallback) still renders inside the badge with the label.
    expect(out).toContain('class="superapp-trust__badgeicon"');
    expect(out).toContain('Handmade');
  });
});

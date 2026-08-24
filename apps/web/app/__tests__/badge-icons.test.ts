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
 * The icon id list lives in ONE place (`BADGE_ICON_IDS` in kind-archetype). The
 * PreviewService hand-authors a mirrored inline-SVG catalog, keyed by the same ids.
 *
 * WS-H Task 5 (Liquid byte reclaim): the storefront no longer hand-authors an inline
 * `<svg><symbol id="sa-ico-<id>">` sprite in Liquid — that ~2 KB catalog never varies
 * per merchant/config, so it moved to `superapp-modules.css` as
 * `.superapp-trust__ico[data-sa-icon="<id>"] { mask-image: ...; }` rules (CSS has a
 * separate, uncontested budget from the Shopify-enforced 100 KB aggregate Liquid wall;
 * see scripts/build-theme-liquid.mjs). The storefront Liquid now emits a
 * `data-sa-icon="<id>"` attribute instead of a `<use href="#sa-ico-<id>">` reference;
 * this test locks the CSS catalog to the same canonical id set so a badge's
 * `fields.icon` can never resolve in the library/PreviewService and silently render
 * blank on the real storefront.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../../..');
// CSS has no separate readable-source directory (see scripts/build-theme-liquid.mjs
// header / apps/web/theme-extension-src/liquid — only Liquid has a source→build split);
// extensions/theme-app-extension/assets/superapp-modules.css IS the source, edited
// directly, so there is only one file to check (no src-vs-built distinction here).
const CSS_ASSET = join(REPO_ROOT, 'extensions/theme-app-extension/assets/superapp-modules.css');

/** Extract `data-sa-icon="<id>"` attribute-selector ids from the CSS mask catalog. */
function cssIconIds(css: string): string[] {
  const ids = new Set<string>();
  for (const m of css.matchAll(/\.superapp-trust__ico\[data-sa-icon="([a-z0-9-]+)"\]/g)) {
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

  it('renders a payment wordmark for a payment icon id', () => {
    const out = html([{ kind: 'badge', text: 'Visa', fields: { icon: 'visa' } }]);
    expect(out).toContain('superapp-trust__ico--pay');
    expect(out).toContain('>VISA<');
    expect(out).toContain('superapp-trust__badge--icon');
  });

  it('renders a stroked glyph for a trust icon id', () => {
    const out = html([{ kind: 'badge', text: 'Secure checkout', fields: { icon: 'secure-checkout' } }]);
    expect(out).toContain('superapp-trust__ico--glyph');
    expect(out).toContain('<path');
  });

  it('falls back to the plain badge (no catalog icon) for an unknown/absent icon', () => {
    const out = html([{ kind: 'badge', text: 'Handmade', fields: { icon: 'not-a-real-icon' } }]);
    // Markup-only tokens (the `superapp-trust__ico*` class names also live in the
    // inlined pack stylesheet). No catalog <svg class="superapp-trust__ico…"> is emitted.
    expect(out).not.toContain('class="superapp-trust__ico');
    expect(out).not.toContain('viewBox="0 0 44 16"'); // payment wordmark viewBox
    // The pre-A2 badge path (glyph fallback) still renders inside the badge with the label.
    expect(out).toContain('class="superapp-trust__badgeicon"');
    expect(out).toContain('Handmade');
  });
});

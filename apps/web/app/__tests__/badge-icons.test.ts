import { readFileSync, readdirSync } from 'node:fs';
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
 * storefront Liquid hand-authors a `<symbol id="sa-ico-<id>">` sprite and the
 * PreviewService hand-authors a mirrored inline-SVG catalog — both keyed by the SAME
 * ids. This locks all three id sets together so a badge's `fields.icon` can never
 * resolve on one surface and silently vanish on the other.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../../..');
// The badge sprite lives in the content-section sub-snippet of the renderer family;
// scan the whole `superapp-module*.liquid` family so the parity guard is robust to the
// sprite moving between files.
const SRC_SNIPPETS = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid/snippets');
const BUILT_SNIPPETS = join(REPO_ROOT, 'extensions/theme-app-extension/snippets');

/** Concatenate every `superapp-module*.liquid` renderer-family file in a snippets dir. */
function readModuleFamily(dir: string): string {
  return readdirSync(dir)
    .filter((f) => /^superapp-module.*\.liquid$/.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

/** Extract `sa-ico-<id>` symbol ids from a Liquid file's inline sprite. */
function spriteIds(liquid: string): string[] {
  const ids = new Set<string>();
  for (const m of liquid.matchAll(/<symbol\s+id="sa-ico-([a-z0-9-]+)"/g)) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}

describe('badge-icon catalog — single-source id parity (A2)', () => {
  const canonical = [...BADGE_ICON_IDS].sort();

  it('guards a non-trivial catalog (payment + trust)', () => {
    expect(BADGE_ICON_IDS.length).toBe(16);
  });

  it('the storefront Liquid sprite covers exactly the canonical id set', () => {
    expect(spriteIds(readModuleFamily(SRC_SNIPPETS)).sort()).toEqual(canonical);
  });

  it('the built extension sprite carries the same ids (rebuild not forgotten)', () => {
    expect(spriteIds(readModuleFamily(BUILT_SNIPPETS)).sort()).toEqual(canonical);
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

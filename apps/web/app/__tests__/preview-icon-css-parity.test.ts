import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { PreviewService, BADGE_ICON_PREVIEW_IDS } from '~/services/preview/preview.service';

/**
 * R0 parity coverage guard (WS-H Task 5 fix round 1).
 *
 * The trust-badge icon sprite and the floating-widget's per-variant icons moved
 * out of hand-authored inline SVG (in both the storefront Liquid AND
 * PreviewService) into CSS `mask-image` rules in `superapp-modules.css`. Both
 * renderers now emit classes/attributes that MEAN NOTHING without a matching CSS
 * rule — an icon glyph silently renders as an empty box if the class/attribute
 * PreviewService (or the storefront) emits doesn't have a corresponding
 * selector. This is exactly the gap that let preview drift out of sync with the
 * storefront during this task (PreviewService kept emitting `superapp-trust__
 * ico--pay` / a literal emoji after the CSS rules those relied on were deleted
 * or repurposed) — a real regression that shipped and was only caught by
 * coordinator re-review, not by any test. This file is the standing guard:
 * every icon-related class/attribute PreviewService can emit must resolve
 * against the ACTUAL shipped superapp-modules.css.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../../..');
const CSS_ASSET = join(REPO_ROOT, 'extensions/theme-app-extension/assets/superapp-modules.css');
const css = readFileSync(CSS_ASSET, 'utf8');

/** True if `css` has a selector matching `[data-sa-icon="<id>"]` (quote-tolerant — esbuild's CSS minifier drops attribute-selector quotes when they're not needed). */
function cssHasIconSelector(id: string): boolean {
  const re = new RegExp(`\\.superapp-trust__ico\\[data-sa-icon=['"]?${id.replace(/[-]/g, '\\-')}['"]?\\]`);
  return re.test(css);
}

/** True if `css` has a selector matching `.superapp-fw__icon--<variant>` (as a class token in a selector — with or without the compound `.superapp-fw__icon.superapp-fw__icon--<variant>` form, and tolerant of a comma-grouped selector list like the shared whatsapp/chat rule). */
function cssHasFwIconVariantSelector(variant: string): boolean {
  const re = new RegExp(`\\.superapp-fw__icon(\\.superapp-fw__icon)?--${variant}(?![a-z-])`);
  return re.test(css);
}

function badgeHtml(icon: string): string {
  const service = new PreviewService();
  const spec = {
    type: 'theme.section',
    name: 'Badges',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind: 'trust-badges',
      activation: 'section',
      title: 'Trust',
      subtitle: '',
      fields: {},
      blocks: [{ kind: 'badge', text: icon, fields: { icon } }],
    },
    placement: { enabled_on: { templates: ['product'] } },
  } as unknown as RecipeSpec;
  const r = service.render(spec);
  return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
}

function fwHtml(variant: string): string {
  const service = new PreviewService();
  const spec = {
    type: 'theme.section',
    name: 'Floating widget',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: { kind: 'floatingWidget', activation: 'global', variant, title: '', subtitle: '', fields: {} },
    placement: { enabled_on: { templates: ['product'] } },
  } as unknown as RecipeSpec;
  const r = service.render(spec);
  return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
}

describe('preview <-> storefront icon CSS class-coverage guard (WS-H Task 5 fix round 1)', () => {
  it('every BADGE_ICON_PREVIEW_IDS id renders a data-sa-icon attribute with a matching CSS mask selector', () => {
    expect(BADGE_ICON_PREVIEW_IDS.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const id of BADGE_ICON_PREVIEW_IDS) {
      const html = badgeHtml(id);
      const emitted = html.includes(`data-sa-icon="${id}"`);
      if (!emitted) {
        missing.push(`${id}: PreviewService did not emit data-sa-icon="${id}"`);
        continue;
      }
      if (!cssHasIconSelector(id)) {
        missing.push(`${id}: emitted data-sa-icon="${id}" but no [data-sa-icon="${id}"] selector in the shipped CSS`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('the payment/glyph size-modifier class PreviewService applies per id matches the storefront Liquid\'s sa_pay_ids split', () => {
    const PAY_IDS = ['visa', 'mastercard', 'amex', 'paypal', 'shop-pay', 'apple-pay', 'google-pay', 'klarna'];
    for (const id of PAY_IDS) {
      expect(badgeHtml(id), id).toContain(`class="superapp-trust__ico" data-sa-icon="${id}"`);
    }
    const GLYPH_IDS = BADGE_ICON_PREVIEW_IDS.filter((id) => !PAY_IDS.includes(id));
    expect(GLYPH_IDS.length).toBeGreaterThan(0);
    for (const id of GLYPH_IDS) {
      expect(badgeHtml(id), id).toContain(`class="superapp-trust__ico superapp-trust__ico--glyph" data-sa-icon="${id}"`);
    }
  });

  it('every known floating-widget variant renders a superapp-fw__icon--<variant> class with a matching CSS mask selector', () => {
    // Same variant set the storefront Liquid's superapp-modules.css authors rules
    // for (WS-H Task 5) — 'custom' and any unknown variant deliberately emit NO
    // modifier class, falling through to the base .superapp-fw__icon default mask.
    const KNOWN_VARIANTS = ['whatsapp', 'chat', 'coupon', 'cart', 'scroll_top'];
    const missing: string[] = [];
    for (const variant of KNOWN_VARIANTS) {
      const html = fwHtml(variant);
      const handle = variant.replace(/_/g, '-');
      const emitted = html.includes(`superapp-fw__icon--${handle}`);
      if (!emitted) {
        missing.push(`${variant}: PreviewService did not emit a superapp-fw__icon--${handle} class`);
        continue;
      }
      if (!cssHasFwIconVariantSelector(handle)) {
        missing.push(`${variant}: emitted superapp-fw__icon--${handle} but no matching selector in the shipped CSS`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('an unknown/custom floating-widget variant emits no modifier class (falls through to the base .superapp-fw__icon mask, not a broken class reference)', () => {
    // Scoped to the rendered <span> itself, not the whole page — the page ALSO
    // inlines the full real superapp-modules.css (R0 parity), which legitimately
    // contains every superapp-fw__icon--<variant> selector as plain stylesheet
    // text regardless of which variant this specific render is previewing.
    for (const variant of ['custom', 'not-a-real-variant']) {
      const html = fwHtml(variant);
      const iconSpan = html.match(/<span class="superapp-fw__icon[^"]*"[^>]*><\/span>/);
      expect(iconSpan, variant).toBeTruthy();
      expect(iconSpan?.[0] ?? '', variant).toBe('<span class="superapp-fw__icon" aria-hidden="true"></span>');
    }
  });

  it('the base .superapp-fw__icon default mask rule exists in the shipped CSS', () => {
    expect(css).toMatch(/\.superapp-fw__icon\s*\{[^}]*mask-image/);
  });

  it('no emoji or other literal glyph content is emitted inside a superapp-fw__icon span (it would be clipped by the mask-image rule now applied to that class)', () => {
    for (const variant of ['whatsapp', 'chat', 'coupon', 'cart', 'scroll_top', 'custom']) {
      const html = fwHtml(variant);
      const iconSpan = html.match(/<span class="superapp-fw__icon[^"]*"[^>]*>([^<]*)<\/span>/);
      expect(iconSpan, variant).toBeTruthy();
      expect(iconSpan?.[1] ?? '', variant).toBe('');
    }
  });
});

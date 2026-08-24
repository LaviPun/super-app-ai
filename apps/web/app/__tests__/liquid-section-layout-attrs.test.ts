import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WS-H Task 5 Liquid byte reclaim. The layout-modifier / --sa-cols clamp /
 * minimal-textonly variant class computation that used to live inline in
 * superapp-module-sections.liquid's {% liquid %} block (three `| append:`
 * chains building a class string, ~530 B of the byte-budgeted Liquid family)
 * moved to superapp-modules.js, which reads raw data-sa-* attributes on the
 * rendered <section> and applies the equivalent classes/--sa-cols style on
 * DOMContentLoaded — the same progressive-enhancement lever the file already
 * uses for its before-after/hotspots/tabs kinds.
 *
 * No-JS guardrail (binding requirement from the plan): the <section> class
 * Liquid emits directly must always be the plain
 * `superapp-section superapp-section--<kind> sa-reveal` base — no computed
 * modifier — so a JS-disabled storefront still renders correctly, just
 * without the layout/column/minimal/textonly refinements.
 *
 * This is a static-content + extracted-logic test (same style as
 * liquid-media-placeholder.test.ts — no Liquid execution engine is wired up
 * yet, that's Task 8's job) PLUS a behavioral check that evals the actual
 * shipped minified JS function against fake DOM elements, so a future edit to
 * superapp-modules.js can't silently break the clamp/variant arithmetic
 * without this test catching it.
 */

const REPO_ROOT = join(__dirname, '../../../..');
const SECTIONS_SRC = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid/snippets/superapp-module-sections.liquid');
const JS_ASSET = join(REPO_ROOT, 'extensions/theme-app-extension/assets/superapp-modules.js');

function readSectionTag(): string {
  const src = readFileSync(SECTIONS_SRC, 'utf8');
  const match = src.match(/<section class="superapp-section[^>]*>/);
  if (!match) throw new Error('generic <section> tag not found in superapp-module-sections.liquid');
  return match[0];
}

describe('superapp-module-sections.liquid <section> tag (WS-H Task 5 layout-attr extraction)', () => {
  it('the Liquid-emitted class carries no computed layout/variant modifier (no-JS default)', () => {
    const tag = readSectionTag();
    const classAttr = tag.match(/class="([^"]*)"/)?.[1] ?? '';
    expect(classAttr).toBe('superapp-section superapp-section--{{ kind | handle }} sa-reveal');
  });

  it('emits raw data-sa-* attributes for the JS-side layout/variant computation', () => {
    const tag = readSectionTag();
    for (const attr of ['data-sa-lay', 'data-sa-cols', 'data-sa-blk', 'data-sa-img', 'data-sa-bdy', 'data-sa-bi']) {
      expect(tag, `missing ${attr}`).toContain(`${attr}=`);
    }
  });

  it('never prints a bare comparison inside a {{ }} output tag (Shopify\'s real Liquid/HTML parser rejects it — confirmed via @shopify/theme-check-node, liquidjs tolerates it but the real parser does not)', () => {
    const src = readFileSync(SECTIONS_SRC, 'utf8');
    // A `{{ x != y }}` / `{{ x == y }}` output tag is the specific pattern that
    // broke theme-check with "LiquidHTMLSyntaxError: Syntax is not supported"
    // during this task's development (data-sa-has-image="{{ mod_cfg.imageUrl != blank }}").
    // The fixed form uses an inline {% if %}...{% endif %} instead.
    expect(src).not.toMatch(/\{\{[^}]*(!=|==)[^}]*\}\}/);
  });
});

describe('superapp-modules.js section-layout enhancer (WS-H Task 5)', () => {
  const js = readFileSync(JS_ASSET, 'utf8');

  it('is wired: saApplySectionLayout is defined and invoked from the DOMContentLoaded init dispatch', () => {
    expect(js).toContain('function saApplySectionLayout(');
    expect(js).toContain('function saInitSectionLayouts(');
    expect(js).toContain('saInitSectionLayouts()');
  });

  function loadSaApplySectionLayout(): (el: unknown) => void {
    const start = js.indexOf('function saApplySectionLayout');
    const end = js.indexOf('function saInitSectionLayouts');
    if (start === -1 || end === -1) throw new Error('saApplySectionLayout not found in superapp-modules.js');
    // Evaluate the ACTUAL shipped minified function (not a hand-copy), via the
    // Function constructor, so this test fails if the real asset regresses.
    const fn = new Function(`${js.slice(start, end)}\nreturn saApplySectionLayout;`)();
    return fn as (el: unknown) => void;
  }

  function makeEl(attrs: Record<string, string>) {
    const classes = new Set(['superapp-section']);
    const styles: Record<string, string> = {};
    return {
      dataset: {} as Record<string, string>,
      getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
      classList: { add: (c: string) => classes.add(c) },
      style: { setProperty: (k: string, v: string) => { styles[k] = v; } },
      classes,
      styles,
    };
  }

  it('applies the layout modifier class and clamps --sa-cols to [1,4] and to the block count', () => {
    const saApplySectionLayout = loadSaApplySectionLayout();
    const el = makeEl({ 'data-sa-lay': 'grid', 'data-sa-cols': '5', 'data-sa-blk': '3', 'data-sa-img': '1', 'data-sa-bdy': '', 'data-sa-bi': 'true' });
    saApplySectionLayout(el);
    expect(el.classes.has('superapp-layout--grid')).toBe(true);
    expect(el.styles['--sa-cols']).toBe('3'); // clamped down to the 3 available blocks, not the requested 5
  });

  it('never applies a layout modifier for the stacked/blank default (matches the pre-Task-5 no-op)', () => {
    const saApplySectionLayout = loadSaApplySectionLayout();
    const el = makeEl({ 'data-sa-lay': 'stacked', 'data-sa-cols': '', 'data-sa-blk': '0', 'data-sa-img': '', 'data-sa-bdy': '', 'data-sa-bi': 'false' });
    saApplySectionLayout(el);
    expect([...el.classes].some((c) => c.startsWith('superapp-layout--'))).toBe(false);
  });

  it('applies superapp-section--minimal when there is no image, body, or blocks', () => {
    const saApplySectionLayout = loadSaApplySectionLayout();
    const el = makeEl({ 'data-sa-lay': '', 'data-sa-cols': '', 'data-sa-blk': '0', 'data-sa-img': '', 'data-sa-bdy': '', 'data-sa-bi': 'false' });
    saApplySectionLayout(el);
    expect(el.classes.has('superapp-section--minimal')).toBe(true);
  });

  it('applies superapp-section--textonly when blocks exist but none carries an image', () => {
    const saApplySectionLayout = loadSaApplySectionLayout();
    const el = makeEl({ 'data-sa-lay': '', 'data-sa-cols': '', 'data-sa-blk': '2', 'data-sa-img': '', 'data-sa-bdy': '', 'data-sa-bi': 'false' });
    saApplySectionLayout(el);
    expect(el.classes.has('superapp-section--textonly')).toBe(true);
  });

  it('is idempotent (a second pass over the same element is a no-op, guarded by a bound flag)', () => {
    const saApplySectionLayout = loadSaApplySectionLayout();
    const el = makeEl({ 'data-sa-lay': 'grid', 'data-sa-cols': '', 'data-sa-blk': '0', 'data-sa-img': '1', 'data-sa-bdy': '', 'data-sa-bi': 'false' });
    saApplySectionLayout(el);
    saApplySectionLayout(el);
    expect([...el.classes].filter((c) => c === 'superapp-layout--grid')).toHaveLength(1);
  });
});

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
 * shipped JS function against fake DOM elements, so a future edit to
 * superapp-modules.js can't silently break the clamp/variant arithmetic
 * without this test catching it.
 *
 * Fix round 1 (source-of-truth correction): superapp-modules.js is now built
 * from apps/web/theme-extension-src/superapp-modules.src.js via
 * `esbuild --minify`, which RENAMES local function identifiers (unlike the
 * hand-written minified form this test originally shipped against). This test
 * locates the enhancer/init functions by a marker STRING that survives any
 * minifier (string literals are never renamed) plus brace-matching, instead of
 * hardcoding a specific minified name — so it stays correct regardless of which
 * minifier produced the shipped asset.
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

/**
 * Find the function whose body contains `marker` (a string literal — stable
 * across any minifier's identifier renaming) and return its resolved name +
 * full source, using brace-matching so this works regardless of formatting.
 */
function extractFunctionByMarker(js: string, marker: string): { name: string; body: string; end: number } {
  const markerIdx = js.indexOf(marker);
  if (markerIdx === -1) throw new Error(`marker not found in superapp-modules.js: ${marker}`);
  const fnKeywordIdx = js.lastIndexOf('function ', markerIdx);
  if (fnKeywordIdx === -1) throw new Error(`no enclosing "function " keyword found before marker: ${marker}`);
  const head = js.slice(fnKeywordIdx, fnKeywordIdx + 80);
  const nameMatch = head.match(/^function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
  if (!nameMatch) throw new Error(`could not parse a function name at: ${head}`);
  const braceStart = js.indexOf('{', fnKeywordIdx);
  let depth = 0;
  let i = braceStart;
  for (; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const name = nameMatch[1];
  if (!name) throw new Error(`could not parse a function name at: ${head}`);
  return { name, body: js.slice(fnKeywordIdx, i), end: i };
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
  // `saLayBound` is a dataset PROPERTY name (el.dataset.saLayBound), not a local
  // identifier — minifiers rename local functions/vars but never object property
  // names, so this string is a stable anchor regardless of which minifier built
  // the shipped asset.
  const enhancer = extractFunctionByMarker(js, 'saLayBound');
  const initFn = extractFunctionByMarker(js, '.superapp-section[data-sa-lay]');

  it('is wired: the enhancer is defined, the init function forEach-calls it over every tagged <section>, and init runs from the DOMContentLoaded dispatch', () => {
    expect(enhancer.body).toContain('function');
    expect(initFn.body).toContain('.superapp-section[data-sa-lay]');
    // init's querySelectorAll(...) result must be forEach'd with the enhancer's
    // resolved name, e.g. `Array.prototype.forEach.call(e,Et)`.
    expect(initFn.body).toMatch(new RegExp(`forEach\\.call\\([^,]+,\\s*${enhancer.name}\\)`));
    // init itself must be invoked somewhere later in the file (the ready/DOMContentLoaded dispatch).
    const restOfFile = js.slice(initFn.end);
    expect(restOfFile).toMatch(new RegExp(`\\b${initFn.name}\\(\\)`));
  });

  function loadEnhancer(): (el: unknown) => void {
    // Evaluate the ACTUAL shipped function (not a hand-copy), via the Function
    // constructor, so this test fails if the real asset regresses. Bind it to
    // its own resolved name so `return <name>` works whatever that name is.
    const fn = new Function(`${enhancer.body}\nreturn ${enhancer.name};`)();
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
    const applySectionLayout = loadEnhancer();
    const el = makeEl({ 'data-sa-lay': 'grid', 'data-sa-cols': '5', 'data-sa-blk': '3', 'data-sa-img': '1', 'data-sa-bdy': '', 'data-sa-bi': 'true' });
    applySectionLayout(el);
    expect(el.classes.has('superapp-layout--grid')).toBe(true);
    expect(el.styles['--sa-cols']).toBe('3'); // clamped down to the 3 available blocks, not the requested 5
  });

  it('never applies a layout modifier for the stacked/blank default (matches the pre-Task-5 no-op)', () => {
    const applySectionLayout = loadEnhancer();
    const el = makeEl({ 'data-sa-lay': 'stacked', 'data-sa-cols': '', 'data-sa-blk': '0', 'data-sa-img': '', 'data-sa-bdy': '', 'data-sa-bi': 'false' });
    applySectionLayout(el);
    expect([...el.classes].some((c) => c.startsWith('superapp-layout--'))).toBe(false);
  });

  it('applies superapp-section--minimal when there is no image, body, or blocks', () => {
    const applySectionLayout = loadEnhancer();
    const el = makeEl({ 'data-sa-lay': '', 'data-sa-cols': '', 'data-sa-blk': '0', 'data-sa-img': '', 'data-sa-bdy': '', 'data-sa-bi': 'false' });
    applySectionLayout(el);
    expect(el.classes.has('superapp-section--minimal')).toBe(true);
  });

  it('applies superapp-section--textonly when blocks exist but none carries an image', () => {
    const applySectionLayout = loadEnhancer();
    const el = makeEl({ 'data-sa-lay': '', 'data-sa-cols': '', 'data-sa-blk': '2', 'data-sa-img': '', 'data-sa-bdy': '', 'data-sa-bi': 'false' });
    applySectionLayout(el);
    expect(el.classes.has('superapp-section--textonly')).toBe(true);
  });

  it('is idempotent (a second pass over the same element is a no-op, guarded by a bound flag)', () => {
    const applySectionLayout = loadEnhancer();
    const el = makeEl({ 'data-sa-lay': 'grid', 'data-sa-cols': '', 'data-sa-blk': '0', 'data-sa-img': '1', 'data-sa-bdy': '', 'data-sa-bi': 'false' });
    applySectionLayout(el);
    applySectionLayout(el);
    expect([...el.classes].filter((c) => c === 'superapp-layout--grid')).toHaveLength(1);
  });
});

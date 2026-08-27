import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Liquid, Tag, type TagToken, type TopLevelToken } from 'liquidjs';
import { MODULE_TEMPLATES, type RecipeSpec, type TemplateEntry } from '@superapp/core';
import { KIND_ARCHETYPE, type SectionArchetype } from '~/services/recipes/kind-archetype';
import { PreviewService } from '~/services/preview/preview.service';

/**
 * Output-level preview<->Liquid parity fixture (WS-H Task 8).
 *
 * kind-archetype-parity.test.ts (R0) proves the kind->archetype alias TABLE is
 * symbol-identical across PreviewService, the native-section compiler, and the
 * storefront Liquid `case sa_kind_h` dispatch. It never renders anything. This
 * test extends R0 to the OUTPUT level: for one real, shipped template config per
 * `SectionArchetype`, it actually executes the readable Liquid source (via
 * liquidjs + a small Shopify-filter/tag shim) and asserts the rendered markup
 * carries the SAME BEM root class + placeholder-media decision that
 * PreviewService's deterministic admin preview shows for the identical spec
 * (H4: structural markers, not byte-identity — PreviewService intentionally
 * wraps its output in different outer chrome than the storefront theme page).
 *
 * Fixture selection: real `config` pulled from `ALL_TEMPLATES` by kind (never
 * hand-invented), one representative kind per archetype, so every fixture is
 * provably representative of shipped content.
 *
 * Scope note (adaptation recorded per plan binding rule 4): the plan's Task 8
 * scaffold sketch also mentions the two LIQUID_ONLY_KINDS carved out by R0
 * ('pdp', 'sticky-atc' family) as candidate extra fixtures. Investigation showed
 * neither is meaningful here: 'pdp' has no SectionArchetype mapping at all (it
 * isn't in KIND_ARCHETYPE — PreviewService has no dedicated archetype renderer
 * for it, so it would render via the unrelated generic/technical fallback, not a
 * comparable code path), and 'sticky-atc' already has its own dedicated
 * PreviewService renderer (`sectionStickyAtc`) that R0 documents as a Liquid-only
 * exception outside the canonical 18-archetype union. Extending an "extends R0"
 * test to symbols R0 itself declares out of the canonical union would blur, not
 * strengthen, the guarantee — so this fixture set is exactly the 18
 * `SectionArchetype` members, the actual single source of truth.
 */

const HERE = __dirname;
const REPO_ROOT = join(HERE, '../../../..');
const SNIPPETS = join(REPO_ROOT, 'apps/web/theme-extension-src/liquid/snippets');

/** Shopify's `{% doc %}...{% enddoc %}` / `{% schema %}...{% endschema %}` are
 * Shopify-only block tags liquidjs doesn't know. Neither is meant to be
 * rendered — mirror liquidjs's own built-in `raw` tag (dist/tags/raw.*): consume
 * tokens verbatim until the matching end tag, emit nothing. */
function noopBlockTag(endName: string) {
  return class extends Tag {
    constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
      super(tagToken, remainTokens, liquid);
      while (remainTokens.length) {
        const token = remainTokens.shift()!;
        if ('name' in token && (token as TagToken).name === endName) return;
      }
    }
    *render(): Generator<unknown, string> {
      return '';
    }
  };
}

function buildEngine(): Liquid {
  const engine = new Liquid({ root: SNIPPETS, extname: '.liquid' });
  // Shopify-specific filters (Verified ground truth: exactly 4 non-Ruby-Liquid-
  // standard filters used by this renderer family — money/image_url/json/handle).
  // `json` is already liquidjs-native and Shopify-compatible (compact JSON) —
  // left alone. `money`/`image_url` are undefined in base liquidjs (fall through
  // as no-ops); `handle` IS defined in base liquidjs but does NOT slugify like
  // Shopify's (confirmed empirically: `'a b' | handle` -> `'a b'`, not `'a-b'`) —
  // all three are overridden here to match Shopify's real behavior.
  engine.registerFilter('money', (cents: unknown) => `$${(Number(cents) / 100).toFixed(2)}`);
  engine.registerFilter('image_url', (url: unknown) => String(url ?? ''));
  engine.registerFilter('handle', (s: unknown) =>
    String(s ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, ''),
  );
  engine.registerTag('doc', noopBlockTag('enddoc'));
  engine.registerTag('schema', noopBlockTag('endschema'));
  // liquidjs's built-in `{% # ... %}` inline-comment tag enforces that every
  // continuation line starts with '#' (its own InlineCommentTag, dist/liquid.node.js)
  // — Shopify's real Liquid engine is more lenient (this renderer family's source
  // uses multi-line `{% # ... %}` doc-style comments freely, confirmed by real
  // execution: `{% # R2.5 layout archetype ... %}` at
  // superapp-module-sections.liquid:22-40 threw liquidjs's strict-mode error on
  // first run). Re-register '#' as an unconditional no-op comment, matching
  // Shopify's actual behavior rather than liquidjs's stricter one.
  engine.registerTag('#', {
    parse() {
      /* consume no extra tokens — the tag's own args already hold the whole
       * inline comment body; nothing else to do. */
    },
    render() {
      return '';
    },
  });
  return engine;
}

/** BEM root class each PreviewService archetype renderer AND the Liquid `case
 * sa_arch` dispatch both use for the same archetype (verified by grepping both
 * files' emitted class literals — see Task 8 investigation). Not asserted to be
 * exhaustive per-archetype vocabulary, just the one marker guaranteed present in
 * both renderers whenever the archetype's content requires it. */
const ARCHETYPE_ROOT_CLASS: Record<SectionArchetype, string> = {
  hero: 'superapp-hero',
  feature: 'superapp-feature',
  gallery: 'superapp-gallery',
  collection: 'superapp-collection',
  pricing: 'superapp-pricing',
  faq: 'superapp-faq',
  testimonial: 'superapp-testimonial',
  stats: 'superapp-stats',
  cta: 'superapp-cta',
  trust: 'superapp-trust',
  newsletter: 'superapp-newsletter',
  launch: 'superapp-launch',
  contact: 'superapp-contactcard',
  team: 'superapp-team',
  timeline: 'superapp-timeline',
  upsell: 'superapp-upsell',
  band: 'superapp-band',
  technical: 'superapp-techcard',
};

/** One representative `kind` per archetype, chosen so a real shipped template
 * exists for it (checked against ALL_TEMPLATES — see Task 8 investigation notes
 * in the report). `contact`/`team`/`timeline`/`technical` favor a kind whose
 * config is non-trivial (has blocks) so the archetype's block-rendering branch
 * actually exercises, not just the empty-state fallback. */
const ARCHETYPE_FIXTURE_KIND: Record<SectionArchetype, string> = {
  hero: 'hero',
  feature: 'feature',
  gallery: 'gallery',
  collection: 'collection-list',
  pricing: 'pricing',
  faq: 'faq',
  testimonial: 'testimonials',
  stats: 'stats',
  cta: 'cta',
  trust: 'trust-badges',
  newsletter: 'newsletter',
  launch: 'coming-soon',
  contact: 'contact',
  team: 'team',
  timeline: 'timeline',
  upsell: 'upsell',
  band: 'countdown-bar',
  // NOT 'size-chart'/'sticky-atc': both are technical-kind SPECIAL CASES with
  // their own dedicated root class in both renderers (superapp-sizechart /
  // PreviewService's sectionStickyAtc) rather than the plain techcard fallback
  // this fixture's ARCHETYPE_ROOT_CLASS expects. 'json-ld' hits the generic
  // technical/techcard branch cleanly in both.
  technical: 'json-ld',
};

function findRealTemplate(kind: string): TemplateEntry {
  const t = MODULE_TEMPLATES.find(
    (entry) => entry.spec.type === 'theme.section' && (entry.spec.config as { kind?: string }).kind === kind,
  );
  if (!t) throw new Error(`No shipped theme.section template found with kind '${kind}' — fixture map is stale`);
  return t;
}

type Fixture = { archetype: SectionArchetype; kind: string; template: TemplateEntry };

const FIXTURES: Fixture[] = (Object.keys(ARCHETYPE_FIXTURE_KIND) as SectionArchetype[]).map((archetype) => {
  const kind = ARCHETYPE_FIXTURE_KIND[archetype];
  return { archetype, kind, template: findRealTemplate(kind) };
});

describe('preview <-> Liquid output-level parity (WS-H, extends the R0 symbol-level guard)', () => {
  it('sanity: every canonical SectionArchetype has exactly one fixture', () => {
    const archetypes = new Set(Object.values(KIND_ARCHETYPE));
    const fixtureArchetypes = new Set(FIXTURES.map((f) => f.archetype));
    expect([...archetypes].sort()).toEqual([...fixtureArchetypes].sort());
    expect(FIXTURES.length).toBe(18);
  });

  for (const fixture of FIXTURES) {
    it(`kind "${fixture.kind}" (${fixture.archetype}): same archetype root class + same placeholder-vs-real media decision`, async () => {
      const spec = fixture.template.spec as Extract<RecipeSpec, { type: 'theme.section' }>;
      const previewResult = new PreviewService().render(spec);
      if (previewResult.kind !== 'HTML') throw new Error(`expected HTML preview for ${fixture.kind}`);
      const previewHtml = previewResult.html;

      const engine = buildEngine();
      const liquidHtml = await engine.renderFile('superapp-module-sections.liquid', {
        mod_cfg: spec.config,
        kind: spec.config.kind,
        module_id: fixture.template.id,
      });

      // 1) Archetype root class parity — both renderers stamp the same BEM root
      // for a given archetype (H4: structural marker, not byte-identity).
      const rootClass = ARCHETYPE_ROOT_CLASS[fixture.archetype];
      expect(previewHtml, `preview should contain ${rootClass} for a ${fixture.archetype} fixture`).toContain(
        rootClass,
      );
      expect(liquidHtml, `Liquid should contain ${rootClass} for a ${fixture.archetype} fixture`).toContain(
        rootClass,
      );

      // 2) Placeholder-vs-real media parity (H3: both renderers share the SAME
      // isPlaceholderUrl() rule set — PreviewService's phMedia()/PH_SVG and the
      // Liquid superapp-module-media partial). Shipped template demo media is
      // always a placeholder domain (Tmpl-3 regression guard, Task 7), so if this
      // fixture's config carries ANY *ImageUrl/*VideoUrl/imageUrl field, both
      // renderers must independently decide "placeholder" and emit the shared
      // `superapp-ph` marker — never a broken real <img> in one but not the
      // other.
      const cfg = spec.config as Record<string, unknown>;
      const fields = (cfg.fields ?? {}) as Record<string, unknown>;
      // Media-ish URL field names only (image/video/poster/photo/logo/media +
      // "Url") — NOT every `*Url` field. Several fixtures carry unrelated link
      // fields (e.g. cta's `primaryCtaUrl`) that must not trip this check.
      const isMediaUrlKey = (k: string) => /(?:image|video|poster|photo|logo|media)url$/i.test(k);
      const hasMediaField =
        typeof cfg.imageUrl === 'string' ||
        Object.entries(fields).some(([k, v]) => isMediaUrlKey(k) && typeof v === 'string' && v.length > 0);
      if (hasMediaField) {
        expect(previewHtml.includes('superapp-ph')).toBe(liquidHtml.includes('superapp-ph'));
      }
    });
  }
});

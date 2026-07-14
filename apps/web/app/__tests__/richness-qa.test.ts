import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import {
  runRichnessQa,
  detectRichnessExempt,
  basicnessScore,
} from '~/services/ai/richness-qa.server';

/** Build a loose theme.section recipe from a config object (schema-free — the
 * richness gate only reads `config`). */
function section(config: Record<string, unknown>): RecipeSpec {
  return {
    type: 'theme.section',
    name: 'Richness Fixture',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config,
  } as unknown as RecipeSpec;
}

const failIds = (recipe: RecipeSpec, opts = {}) =>
  runRichnessQa(recipe, opts).filter((i) => i.severity === 'fail').map((i) => i.id);
const allIds = (recipe: RecipeSpec, opts = {}) => runRichnessQa(recipe, opts).map((i) => i.id);

describe('richness floors — hero (blocking)', () => {
  it('passes with a CTA + subtitle', () => {
    const r = section({ kind: 'hero', subtitle: 'Free shipping over $50', blocks: [{ kind: 'cta', text: 'Shop', url: '/c' }] });
    expect(runRichnessQa(r)).toEqual([]);
  });
  it('fails (blocking) with no CTA and no subtitle', () => {
    const r = section({ kind: 'hero', title: 'Just a headline' });
    expect(failIds(r)).toContain('richness.floor.hero');
  });
  it('does NOT require media (editorial heroes ship without it)', () => {
    const r = section({ kind: 'hero', subtitle: 'x', blocks: [{ kind: 'cta', text: 'Go', url: '/g' }] });
    // no imageUrl anywhere, still passes
    expect(runRichnessQa(r)).toEqual([]);
  });
});

describe('richness floors — pricing (blocking)', () => {
  it('passes with ≥2 plans and a highlighted tier', () => {
    const r = section({
      kind: 'pricing',
      blocks: [
        { kind: 'plan', text: 'Starter', fields: { price: '19' } },
        { kind: 'plan', text: 'Growth', fields: { price: '49', recommended: true } },
      ],
    });
    expect(runRichnessQa(r)).toEqual([]);
  });
  it('fails with no pricing content', () => {
    const r = section({ kind: 'pricing', blocks: [] });
    expect(failIds(r)).toContain('richness.floor.pricing');
  });
  it('accepts a single featured-plan card (NSEC-PRICE-05 shape)', () => {
    const r = section({ kind: 'pricing', fields: { highlightBlockIndex: 0 }, blocks: [{ kind: 'plan', text: 'Pro' }] });
    expect(runRichnessQa(r)).toEqual([]);
  });
  it('fails when no tier is highlighted', () => {
    const r = section({
      kind: 'pricing',
      blocks: [{ kind: 'plan', text: 'A' }, { kind: 'plan', text: 'B' }],
    });
    expect(failIds(r)).toContain('richness.floor.pricing');
  });
});

describe('richness floors — upsell (blocking)', () => {
  it('passes with a product block + offer source', () => {
    const r = section({
      kind: 'upsell',
      fields: { offerSource: 'manual' },
      blocks: [{ kind: 'feature', text: 'Add-on', url: '/a' }],
    });
    expect(runRichnessQa(r)).toEqual([]);
  });
  it('fails with no recommendation entries', () => {
    const r = section({ kind: 'upsell', blocks: [] });
    expect(failIds(r)).toContain('richness.floor.upsell');
  });
});

describe('richness floors — popup (blocking, detected off overlay/kind)', () => {
  it('passes with trigger + frequency', () => {
    const r = section({ kind: 'popup', activation: 'overlay', trigger: 'exit_intent', frequency: 'once_per_session' });
    expect(runRichnessQa(r)).toEqual([]);
  });
  it('fails when frequency cap is missing', () => {
    const r = section({ kind: 'popup', activation: 'overlay', trigger: 'exit_intent' });
    expect(failIds(r)).toContain('richness.floor.popup');
  });
});

describe('richness floors — testimonial / faq (warn, non-blocking)', () => {
  it('testimonial with <3 entries warns but does not block', () => {
    const r = section({ kind: 'testimonials', blocks: [{ kind: 'quote', text: 'Great' }] });
    expect(allIds(r)).toContain('richness.floor.testimonial');
    expect(failIds(r)).not.toContain('richness.floor.testimonial');
  });
  it('faq with <4 items warns but does not block', () => {
    const r = section({ kind: 'faq', blocks: [{ kind: 'faq-item', text: 'Q1?', fields: { answer: 'A' } }] });
    const issues = runRichnessQa(r);
    const faq = issues.find((i) => i.id === 'richness.floor.faq');
    expect(faq?.severity).toBe('warn');
  });
  it('faq with ≥4 items passes', () => {
    const r = section({
      kind: 'faq',
      blocks: [1, 2, 3, 4].map((n) => ({ kind: 'faq-item', text: `Q${n}?`, fields: { answer: 'A' } })),
    });
    expect(runRichnessQa(r)).toEqual([]);
  });
});

describe('richness — basicness detector', () => {
  it('scores 1.0 when packs are fully populated and blocks meet the minimum', () => {
    const config = { kind: 'feature', packA: 'x', packB: { a: 1 }, blocks: [{}, {}] };
    const { score, missing } = basicnessScore(config, 'feature', ['packA', 'packB']);
    expect(score).toBe(1);
    expect(missing).toEqual([]);
  });
  it('flags richness.underuse (fail) when coverage + density are both low', () => {
    const r = section({ kind: 'feature' });
    const ids = failIds(r, { mustHaveControls: ['packA', 'packB', 'packC', 'packD'] });
    expect(ids).toContain('richness.underuse');
  });
  it('does NOT run basicness without a mustHaveControls expectation', () => {
    const r = section({ kind: 'feature' });
    expect(allIds(r)).not.toContain('richness.underuse');
  });
});

describe('richness — exemption', () => {
  it('detectRichnessExempt matches simple/minimal/plain/basic/just/only', () => {
    for (const p of ['make a simple banner', 'MINIMAL hero', 'plain text block', 'a basic popup', 'just a heading', 'only a button']) {
      expect(detectRichnessExempt(p)).toBe(true);
    }
  });
  it('detectRichnessExempt is false for a normal request', () => {
    expect(detectRichnessExempt('build me a high-converting hero with proof')).toBe(false);
  });
  it('richnessExempt skips floors AND basicness', () => {
    const r = section({ kind: 'hero', title: 'bare' }); // would fail hero floor
    expect(runRichnessQa(r, { richnessExempt: true, mustHaveControls: ['packA', 'packB'] })).toEqual([]);
  });
});

describe('richness — non-visual recipes are inert', () => {
  it('returns [] for a config-less recipe', () => {
    const r = { type: 'functions.cartTransform', name: 'fn', category: 'FUNCTIONS' } as unknown as RecipeSpec;
    expect(runRichnessQa(r, { mustHaveControls: ['a', 'b'] })).toEqual([]);
  });
});

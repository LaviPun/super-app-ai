/**
 * V-B FINAL BATCH tests (B6 multi-step forms + product-finder quiz, B7 A/B
 * experiment, B14 sales-pop toasts).
 *
 *  1. PURE LOGIC — the A/B `bucketVariant`/`saHash` pair lives in the theme runtime
 *     source (a browser IIFE), so — like the spin-game / coordination-bus / renderer
 *     -batch logic — we extract the region between the EXPERIMENT-BUCKET-LOGIC
 *     markers and evaluate just that. `resolveQuizOutcome` is imported directly.
 *  2. PACK SCHEMAS — form-fields + experiment validate/reject as specified.
 *  3. QA — design-QA (consent pre-check fail, sales-pop >6 warn, A/B weights warn)
 *     and richness-QA (multi-step form floor) fire as specified.
 *  4. PREVIEW — sales-pop / quiz / multi-step form / A/B badge render distinctly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { RecipeSpec } from '@superapp/core';
import { FormFieldsPackSchema, ExperimentPackSchema } from '@superapp/core';
import { PreviewService } from '~/services/preview/preview.service';
import { runDesignQa } from '~/services/ai/design-qa.server';
import { runRichnessQa } from '~/services/ai/richness-qa.server';
import { resolveQuizOutcome, type Quiz } from '~/routes/proxy.$widgetId';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION_JS = join(HERE, '../../theme-extension-src/superapp-modules.src.js');

// ── 1. A/B bucketing pure logic (extracted from the storefront source) ─────────

const BEGIN = 'EXPERIMENT-BUCKET-LOGIC:BEGIN';
const END = 'EXPERIMENT-BUCKET-LOGIC:END';

type BucketFn = (variants: Array<{ weight?: number }>, key: string) => number;
function extractBucket(): { bucketVariant: BucketFn; saHash: (s: string) => number } {
  const src = readFileSync(EXTENSION_JS, 'utf8').split('\n');
  const b = src.findIndex((l) => l.includes(BEGIN));
  const e = src.findIndex((l) => l.includes(END));
  if (b === -1 || e === -1 || e <= b) throw new Error('EXPERIMENT-BUCKET-LOGIC markers not found');
  const region = src.slice(b + 1, e).join('\n');
  const factory = new Function(`${region}\n; return { bucketVariant: bucketVariant, saHash: saHash };`);
  return factory() as { bucketVariant: BucketFn; saHash: (s: string) => number };
}

describe('B7 — A/B bucketVariant (storefront source)', () => {
  const { bucketVariant, saHash } = extractBucket();
  const AB = [{ weight: 50 }, { weight: 50 }];

  it('is deterministic — same key always lands in the same bucket', () => {
    const a = bucketVariant(AB, 'visitor-123:mod-a');
    const b = bucketVariant(AB, 'visitor-123:mod-a');
    expect(a).toBe(b);
    expect(a === 0 || a === 1).toBe(true);
  });

  it('respects the weight split roughly (90/10 lands mostly on variant 0)', () => {
    const skew = [{ weight: 90 }, { weight: 10 }];
    let zero = 0;
    for (let i = 0; i < 2000; i++) if (bucketVariant(skew, 'v' + i) === 0) zero++;
    // saHash%total is uniform → ~90% on variant 0. Wide band to avoid flakiness.
    expect(zero).toBeGreaterThan(1600);
    expect(zero).toBeLessThan(1980);
  });

  it('falls back to variant 0 when all weights are zero/invalid', () => {
    expect(bucketVariant([{ weight: 0 }, { weight: 0 }], 'x')).toBe(0);
    expect(bucketVariant([{}, {}], 'x')).toBe(0);
  });

  it('returns -1 for an empty variant list', () => {
    expect(bucketVariant([], 'x')).toBe(-1);
  });

  it('saHash is a stable unsigned 32-bit hash', () => {
    expect(saHash('abc')).toBe(saHash('abc'));
    expect(saHash('abc')).not.toBe(saHash('abd'));
    expect(saHash('anything') >= 0).toBe(true);
  });
});

// ── 1b. Quiz outcome resolution (imported directly) ────────────────────────────

describe('B6 — resolveQuizOutcome', () => {
  const quiz: Quiz = {
    questions: [],
    outcomes: [
      { hint: 'dry', heading: 'Hydration', collectionHandle: 'hydration' },
      { hint: 'oily', heading: 'Clarifying', collectionHandle: 'oil-control' },
    ],
    fallback: { heading: 'Bestsellers', collectionHandle: 'bestsellers' },
  };

  it('picks the outcome whose hint accumulated most', () => {
    expect(resolveQuizOutcome(quiz, ['dry', 'dry', 'oily'])).toMatchObject({ hint: 'dry' });
    expect(resolveQuizOutcome(quiz, ['oily', 'oily'])).toMatchObject({ hint: 'oily' });
  });

  it('ties resolve to the first outcome in declared order', () => {
    expect(resolveQuizOutcome(quiz, ['dry', 'oily'])).toMatchObject({ hint: 'dry' });
  });

  it('falls back when nothing accumulated', () => {
    expect(resolveQuizOutcome(quiz, [])).toMatchObject({ collectionHandle: 'bestsellers' });
    expect(resolveQuizOutcome(quiz, ['unknown-hint'])).toMatchObject({ collectionHandle: 'bestsellers' });
  });
});

// ── 2. Pack schemas ────────────────────────────────────────────────────────────

describe('form-fields pack schema', () => {
  it('accepts a valid 2-step form with a success step', () => {
    const r = FormFieldsPackSchema.safeParse({
      steps: [
        { heading: 'Email', fields: [{ type: 'email', label: 'Email', required: true }] },
        { fields: [{ type: 'birthday', label: 'Birthday' }] },
      ],
      successStep: { message: 'Thanks!', discountCode: 'WELCOME10' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.steps[0]!.fields[0]!.required).toBe(true);
  });

  it('rejects >4 steps and a step with no fields', () => {
    expect(FormFieldsPackSchema.safeParse({ steps: [], successStep: { message: 'x' } }).success).toBe(false);
    const fiveSteps = Array.from({ length: 5 }, () => ({ fields: [{ type: 'name', label: 'N' }] }));
    expect(FormFieldsPackSchema.safeParse({ steps: fiveSteps, successStep: { message: 'x' } }).success).toBe(false);
  });
});

describe('experiment pack schema', () => {
  it('accepts exactly two weighted variants', () => {
    const r = ExperimentPackSchema.safeParse({
      enabled: true,
      goal: 'click',
      variants: [
        { id: 'a', weight: 50, overrides: {} },
        { id: 'b', weight: 50, overrides: { headline: 'B' } },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects a single-variant or weight-out-of-range experiment', () => {
    expect(ExperimentPackSchema.safeParse({ variants: [{ id: 'a', weight: 50 }] }).success).toBe(false);
    expect(
      ExperimentPackSchema.safeParse({ variants: [{ id: 'a', weight: 0 }, { id: 'b', weight: 100 }] }).success,
    ).toBe(false);
  });
});

// ── 3. QA rules ──────────────────────────────────────────────────────────────

const section = (config: Record<string, unknown>): RecipeSpec =>
  ({
    type: 'theme.section',
    name: 't',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: { activation: 'section', fields: {}, blocks: [], ...config },
    placement: { enabled_on: { templates: ['index'] } },
    style: { pack: 'luxe', accessibility: { focusVisible: true, reducedMotion: true } },
  }) as unknown as RecipeSpec;

describe('B6 design-QA — consent must never be pre-checked', () => {
  const base = {
    kind: 'popup',
    activation: 'overlay',
    trigger: 'ON_LOAD',
    frequency: 'ONCE_PER_SESSION',
    title: 'Join',
  };
  it('fails when a consent field is pre-checked', () => {
    const spec = section({
      ...base,
      formFields: { steps: [{ fields: [{ type: 'consent', label: 'Yes', checked: true }] }], successStep: { message: 'ok' } },
    });
    const issues = runDesignQa(spec).issues;
    expect(issues.some((i) => i.id === 'consent:pre-checked' && i.severity === 'fail')).toBe(true);
  });
  it('passes when consent is a plain opt-in', () => {
    const spec = section({
      ...base,
      formFields: { steps: [{ fields: [{ type: 'consent', label: 'Yes' }] }], successStep: { message: 'ok' } },
    });
    expect(runDesignQa(spec).issues.some((i) => i.id === 'consent:pre-checked')).toBe(false);
  });
});

describe('B14 design-QA — sales-pop event fatigue', () => {
  const events = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'event', text: 'buy ' + i, fields: {} }));
  it('warns above 6 events', () => {
    const spec = section({ kind: 'sales-pop', activation: 'global', blocks: events(7) });
    expect(runDesignQa(spec).issues.some((i) => i.id === 'sales-pop:too-many-events' && i.severity === 'warn')).toBe(true);
  });
  it('is quiet at 6 or fewer', () => {
    const spec = section({ kind: 'sales-pop', activation: 'global', blocks: events(4) });
    expect(runDesignQa(spec).issues.some((i) => i.id === 'sales-pop:too-many-events')).toBe(false);
  });
});

describe('B7 design-QA — A/B weights should sum ~100', () => {
  it('warns when the two weights do not total ~100', () => {
    const spec = section({
      kind: 'banner',
      experiment: { enabled: true, variants: [{ id: 'a', weight: 30, overrides: {} }, { id: 'b', weight: 30, overrides: {} }] },
    });
    expect(runDesignQa(spec).issues.some((i) => i.id === 'experiment:weights-sum' && i.severity === 'warn')).toBe(true);
  });
  it('is quiet at 50/50', () => {
    const spec = section({
      kind: 'banner',
      experiment: { enabled: true, variants: [{ id: 'a', weight: 50, overrides: {} }, { id: 'b', weight: 50, overrides: {} }] },
    });
    expect(runDesignQa(spec).issues.some((i) => i.id === 'experiment:weights-sum')).toBe(false);
  });
});

describe('B6 richness-QA — multi-step form floor', () => {
  const popup = (formFields: unknown) =>
    section({ kind: 'popup', activation: 'overlay', trigger: 'ON_LOAD', frequency: 'ONCE_PER_SESSION', title: 'J', formFields });
  it('warns when a step has no fields', () => {
    const issues = runRichnessQa(popup({ steps: [{ fields: [] }], successStep: { message: 'x' } }));
    expect(issues.some((i) => i.id === 'richness.floor.popup.formFields' && i.severity === 'warn')).toBe(true);
  });
  it('is quiet for a well-formed 2-step form', () => {
    const issues = runRichnessQa(
      popup({ steps: [{ fields: [{ type: 'email', label: 'E' }] }, { fields: [{ type: 'name', label: 'N' }] }], successStep: { message: 'x' } }),
    );
    expect(issues.some((i) => i.id === 'richness.floor.popup.formFields')).toBe(false);
  });
});

// ── 4. Preview parity ──────────────────────────────────────────────────────────

const service = new PreviewService();
const render = (spec: RecipeSpec): string => {
  const r = service.render(spec);
  return r.kind === 'HTML' ? r.html : JSON.stringify(r.json);
};

describe('B14 sales-pop preview', () => {
  it('renders a toast in the configured corner with the first tokenized event', () => {
    const out = render(section({
      kind: 'sales-pop', activation: 'global', position: 'bottom-right',
      blocks: [{ kind: 'event', text: '{product} sold {timeAgo}', fields: { product: 'Tote', timeAgo: '2h ago' } }],
    }));
    expect(out).toContain('sp-toast--bottom-right');
    expect(out).toContain('Tote sold 2h ago');
  });
});

describe('B6 multi-step form preview', () => {
  it('renders step 1 fields + progress dots (not a plain popup body)', () => {
    const out = render(section({
      kind: 'popup', activation: 'overlay', trigger: 'ON_LOAD', frequency: 'ONCE_PER_SESSION', title: 'Join',
      formFields: { steps: [{ heading: 'Email', fields: [{ type: 'email', label: 'Email' }, { type: 'consent', label: 'OK' }] }], successStep: { message: 'ok' } },
    }));
    expect(out).toContain('superapp-form__dots');
    expect(out).toContain('superapp-form__consent');
    expect(out).toContain('type="email"');
  });
});

describe('B7 A/B preview', () => {
  it('shows variant A copy + an A/B affordance badge', () => {
    const out = render(section({
      kind: 'banner', heading: 'Base', title: 'Base',
      experiment: { enabled: true, goal: 'click', variants: [
        { id: 'control', weight: 50, overrides: {} },
        { id: 'urgency', weight: 50, overrides: { headline: 'Selling fast' } },
      ] },
    }));
    expect(out).toContain('A/B');
    expect(out).toContain('control');
  });
});

describe('B6 quiz preview (proxy.widget full_page)', () => {
  it('renders the first question + options', () => {
    const spec = {
      type: 'proxy.widget',
      name: 'q',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'skin-finder', mode: 'HTML', surface: 'full_page', title: 'Find your routine',
        quiz: {
          questions: [
            { text: 'Skin type?', options: [{ label: 'Dry', tagHints: ['dry'] }, { label: 'Oily', tagHints: ['oily'] }] },
            { text: 'Goal?', options: [{ label: 'Hydrate', tagHints: ['dry'] }, { label: 'Clarify', tagHints: ['oily'] }] },
          ],
          outcomes: [{ hint: 'dry', collectionHandle: 'hydration' }],
        },
      },
      placement: { enabled_on: { templates: ['page'] } },
      style: { pack: 'bold' },
    } as unknown as RecipeSpec;
    const out = render(spec);
    expect(out).toContain('Skin type?');
    expect(out).toContain('superapp-quiz__option');
    expect(out).toContain('Dry');
  });
});

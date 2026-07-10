import { describe, it, expect } from 'vitest';
import { ALL_TEMPLATES } from '../templates/index.js';
import type { TemplateEntry } from '../templates/types.js';

/**
 * Standing composition lint for the `theme.section` template corpus.
 *
 * Enforces the derived composition invariants from
 * `docs/design-system/composition-rules.md` §6 (which distills the §04 layout laws
 * of the Template Gallery design guide). Every storefront section the library ships
 * must be *composable without a broken layout*: grids whose column count divides the
 * block count, blocks that actually carry the fields their kind renders from, no
 * empty shells, centered copy kept to a short measure, and grid media that always
 * carries an image so rows stay level.
 *
 * Each rule is its own `it()` and reports the full offending-id list in its failure
 * message (collect-all, not fail-fast) so a single run surfaces the whole normalization
 * queue. Rules are asserted against the pre-modernization `ALL_TEMPLATES` — the
 * `modernizeTemplateEntry` pass only injects `requires` flags + type defaults and never
 * rewrites `layout`/`blocks`/`style`, so composition is identical either way.
 */

// ── shared shapes / helpers ──────────────────────────────────────────────────
type Block = {
  kind?: string;
  text?: unknown;
  imageUrl?: unknown;
  url?: unknown;
  fields?: Record<string, unknown>;
};
type SectionConfig = {
  kind?: string;
  title?: unknown;
  subtitle?: unknown;
  heading?: unknown;
  subheading?: unknown;
  message?: unknown;
  body?: unknown;
  ctaText?: unknown;
  ctaLabel?: unknown;
  ctaUrl?: unknown;
  cta?: unknown;
  layout?: { layout?: string; columns?: number };
  blocks?: Block[];
};
type Style = { typography?: { align?: string } };

/** A value counts as "present" when it is a non-empty string or a finite number. */
function present(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.trim().length > 0;
  return v != null && v !== false;
}
function field(b: Block, key: string): unknown {
  return b.fields ? b.fields[key] : undefined;
}
function hasField(b: Block, key: string): boolean {
  return present(field(b, key));
}

const themeSections: TemplateEntry[] = ALL_TEMPLATES.filter((t) => t.spec.type === 'theme.section');

function cfg(t: TemplateEntry): SectionConfig {
  return t.spec.config as unknown as SectionConfig;
}
function style(t: TemplateEntry): Style {
  return (t.spec as { style?: Style }).style ?? {};
}
function blocksOf(t: TemplateEntry): Block[] {
  return cfg(t).blocks ?? [];
}

/**
 * Grid-like layouts carry a `columns` count and the "columns divide content" law.
 * The canonical archetype is `grid` (composition-rules §4); the corpus also uses
 * `columns` as an explicit N-column grid (pricing/feature tables) — same invariant,
 * so both are linted. `masonry` is column-count flow (uneven by design) and is NOT
 * subject to the even-division rule (only to the grid-image rule).
 */
const GRID_LIKE = new Set(['grid', 'columns']);
/** Blocks whose entire purpose is an image tile — must carry `imageUrl` in a grid. */
const MEDIA_KINDS = new Set(['media', 'slide']);

function isGridLike(t: TemplateEntry): boolean {
  return GRID_LIKE.has(cfg(t).layout?.layout ?? '');
}
function anySpan(blocks: Block[]): boolean {
  // Bento-style intentional spans (`fields.span` ∈ single·wide·tall) make row math
  // deliberately uneven — exempt such grids from the even-division rule.
  return blocks.some((b) => present(field(b, 'span')) || present((b as { span?: unknown }).span));
}

// ── Rule 1 — Columns ↔ content ───────────────────────────────────────────────
describe('template composition — §6.1 columns ↔ content', () => {
  it('every grid section has blocks.length >= columns and divides evenly (no orphan rows)', () => {
    const offenders: string[] = [];
    for (const t of themeSections) {
      if (!isGridLike(t)) continue;
      const columns = cfg(t).layout?.columns;
      const blocks = blocksOf(t);
      if (typeof columns !== 'number' || blocks.length === 0) continue;
      if (anySpan(blocks)) continue; // bento intentional spans — exempt
      if (blocks.length < columns) {
        offenders.push(`${t.id}: ${blocks.length} blocks < ${columns} columns`);
      } else if (blocks.length % columns !== 0) {
        offenders.push(`${t.id}: ${blocks.length} blocks not divisible by ${columns} columns (orphan row)`);
      }
    }
    expect(offenders, `Grid column/content mismatch:\n${offenders.join('\n')}`).toEqual([]);
  });
});

// ── Rule 2 — Block-kind completeness (§5.2) ──────────────────────────────────
describe('template composition — §5.2 block-kind completeness', () => {
  it('faq-item blocks carry a question (text) and an answer (fields.answer/detail)', () => {
    const offenders: string[] = [];
    for (const t of themeSections) {
      for (const b of blocksOf(t)) {
        if (b.kind !== 'faq-item') continue;
        if (!present(b.text) || !(hasField(b, 'answer') || hasField(b, 'detail'))) {
          offenders.push(`${t.id}: faq-item "${String(b.text ?? '')}" missing question or answer`);
        }
      }
    }
    expect(offenders, `Incomplete faq-item blocks:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('plan blocks carry fields.price', () => {
    const offenders: string[] = [];
    for (const t of themeSections) {
      for (const b of blocksOf(t)) {
        if (b.kind !== 'plan') continue;
        if (!hasField(b, 'price')) offenders.push(`${t.id}: plan "${String(b.text ?? '')}" missing fields.price`);
      }
    }
    expect(offenders, `Incomplete plan blocks:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('stat blocks carry a value (fields.value or the block text) and fields.label', () => {
    const offenders: string[] = [];
    for (const t of themeSections) {
      for (const b of blocksOf(t)) {
        if (b.kind !== 'stat') continue;
        // Canonical stat shape (native-stats-cta-band): `text` is the value numeral
        // and `fields.label` is the caption. The value slot may be a numeral
        // ("12,000+", "4.9") OR a legitimate word-value ("Free", "30-day", "24/7"),
        // so any non-empty `text` (or an explicit `fields.value`) counts as the value;
        // the paired `fields.label` caption is always required.
        const hasValue = hasField(b, 'value') || present(b.text);
        if (!hasValue || !hasField(b, 'label')) {
          offenders.push(`${t.id}: stat "${String(b.text ?? '')}" missing value or fields.label`);
        }
      }
    }
    expect(offenders, `Incomplete stat blocks:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('team-member blocks carry a name (text) and a role or photo', () => {
    const offenders: string[] = [];
    for (const t of themeSections) {
      for (const b of blocksOf(t)) {
        if (b.kind !== 'team-member') continue;
        const hasPhoto = present(b.imageUrl) || hasField(b, 'photo');
        if (!present(b.text) || !(hasField(b, 'role') || hasPhoto)) {
          offenders.push(`${t.id}: team-member "${String(b.text ?? '')}" missing name or role/photo`);
        }
      }
    }
    expect(offenders, `Incomplete team-member blocks:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('product-card/product/addon blocks carry fields.price', () => {
    const offenders: string[] = [];
    const priced = new Set(['product-card', 'product', 'addon']);
    for (const t of themeSections) {
      for (const b of blocksOf(t)) {
        if (!priced.has(b.kind ?? '')) continue;
        if (!hasField(b, 'price')) {
          offenders.push(`${t.id}: ${b.kind} "${String(b.text ?? '')}" missing fields.price`);
        }
      }
    }
    expect(offenders, `Incomplete product/addon blocks:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('media/slide blocks inside grids carry imageUrl', () => {
    const offenders: string[] = [];
    for (const t of themeSections) {
      if (!isGridLike(t)) continue;
      for (const b of blocksOf(t)) {
        if (!MEDIA_KINDS.has(b.kind ?? '')) continue;
        if (!present(b.imageUrl)) {
          offenders.push(`${t.id}: ${b.kind} "${String(b.text ?? '')}" in a grid missing imageUrl`);
        }
      }
    }
    expect(offenders, `Grid media blocks missing imageUrl:\n${offenders.join('\n')}`).toEqual([]);
  });
});

// ── Rule 3 — No empty sections ───────────────────────────────────────────────
describe('template composition — §6.6 no empty sections', () => {
  it('every theme.section carries at least one of title/subtitle/body/blocks/cta', () => {
    const offenders: string[] = [];
    for (const t of themeSections) {
      const c = cfg(t);
      // A section's authored content may sit at the top level OR, for surfaces whose
      // body is dynamic (e.g. `sticky-atc` — product name/price come from live product
      // context), in `config.fields` as the CTA label. Both count as "not empty".
      const f = (c as { fields?: Record<string, unknown> }).fields ?? {};
      const hasContent =
        present(c.title) ||
        present(c.subtitle) ||
        present(c.heading) ||
        present(c.subheading) ||
        present(c.message) ||
        present(c.body) ||
        blocksOf(t).length > 0 ||
        present(c.ctaText) ||
        present(c.ctaLabel) ||
        present(c.ctaUrl) ||
        present(c.cta) ||
        present(f.ctaLabel) ||
        present(f.ctaText);
      if (!hasContent) offenders.push(`${t.id} (${c.kind ?? '?'})`);
    }
    expect(offenders, `Empty sections (no title/subtitle/body/blocks/cta):\n${offenders.join('\n')}`).toEqual([]);
  });
});

// ── Rule 4 — Centered-measure law (§04 / §6.2) ───────────────────────────────
describe('template composition — §6.2 centered measure', () => {
  // Centered text is capped at a short measure (§3/§6.2 ≤ ~46ch). A centered body
  // paragraph beyond ~280 chars breaks the "never center a long paragraph" law.
  const CENTERED_BODY_MAX = 280;
  it('center-aligned sections keep config.body to a short measure (<= 280 chars)', () => {
    const offenders: string[] = [];
    for (const t of themeSections) {
      if (style(t).typography?.align !== 'center') continue;
      const body = cfg(t).body;
      if (typeof body === 'string' && body.length > CENTERED_BODY_MAX) {
        offenders.push(`${t.id}: centered body is ${body.length} chars (> ${CENTERED_BODY_MAX})`);
      }
    }
    expect(offenders, `Long centered bodies (violate the centered-measure law):\n${offenders.join('\n')}`).toEqual([]);
  });
});

// ── Rule 5 — Grid images (level rows) ────────────────────────────────────────
describe('template composition — §6.4 grid images', () => {
  it('all media-kind blocks in grid/masonry sections carry imageUrl', () => {
    const offenders: string[] = [];
    for (const t of themeSections) {
      const layout = cfg(t).layout?.layout ?? '';
      if (!GRID_LIKE.has(layout) && layout !== 'masonry') continue;
      for (const b of blocksOf(t)) {
        if (!MEDIA_KINDS.has(b.kind ?? '')) continue;
        if (!present(b.imageUrl)) {
          offenders.push(`${t.id}: ${b.kind} "${String(b.text ?? '')}" missing imageUrl in ${layout}`);
        }
      }
    }
    expect(offenders, `Grid/masonry media blocks missing imageUrl:\n${offenders.join('\n')}`).toEqual([]);
  });
});

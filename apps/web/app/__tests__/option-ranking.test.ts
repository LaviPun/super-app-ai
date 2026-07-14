import { describe, it, expect } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { rankOptions, contentDepth, type RankableOption } from '~/services/ai/option-ranking.server';

/** A minimal, schema-valid theme.section — passes verify's deterministic gates. */
function banner(overrides?: Partial<{ heading: string; blocks: unknown[]; extra: Record<string, unknown> }>): RecipeSpec {
  return {
    type: 'theme.section',
    name: 'Test Banner',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind: 'banner',
      activation: 'section',
      fields: { heading: overrides?.heading ?? 'Hello', enableAnimation: false, ...(overrides?.extra ?? {}) },
      blocks: overrides?.blocks ?? [],
    },
  } as RecipeSpec;
}

const CLEAN_QA = { fails: 0, warns: 0, autofixes: 0 };

describe('rankOptions — ordering', () => {
  it('ranks the option with fewer blocking QA fails higher', () => {
    const options: RankableOption[] = [
      { recipe: banner(), qaSummary: { fails: 3, warns: 0, autofixes: 0 }, generationMode: 'freeform' },
      { recipe: banner(), qaSummary: CLEAN_QA, generationMode: 'freeform' },
    ];
    const { recommendedIndex, scores } = rankOptions(options);
    expect(recommendedIndex).toBe(1);
    expect(scores[1]!.score).toBeGreaterThan(scores[0]!.score);
  });

  it('penalizes warns, but far less than fails', () => {
    // Same recipe → identical verify penalty, so only qaSummary drives the delta.
    const r = banner();
    const many1Warn: RankableOption = { recipe: r, qaSummary: { fails: 0, warns: 5, autofixes: 0 }, generationMode: 'freeform' };
    const one1Fail: RankableOption = { recipe: r, qaSummary: { fails: 1, warns: 0, autofixes: 0 }, generationMode: 'freeform' };
    const { scores } = rankOptions([many1Warn, one1Fail]);
    // 5 warns (5 * 1.5 = 7.5) is still less costly than 1 fail (12) → option 0 ranks higher.
    expect(scores[0]!.score).toBeGreaterThan(scores[1]!.score);
  });

  it('a schema-invalid recipe is pushed down by the verify penalty', () => {
    const good: RankableOption = { recipe: banner(), qaSummary: CLEAN_QA };
    // Missing required fields → verifyRecipe reports schemaValid:false (heavy penalty).
    const broken: RankableOption = { recipe: { type: 'theme.section' } as unknown as RecipeSpec, qaSummary: CLEAN_QA };
    const { recommendedIndex, scores } = rankOptions([broken, good]);
    expect(recommendedIndex).toBe(1);
    expect(scores[1]!.score).toBeGreaterThan(scores[0]!.score);
  });
});

describe('rankOptions — delta bonus', () => {
  it('prefers a template-grounded (delta) option over an otherwise-identical freeform one', () => {
    const r = banner();
    const freeform: RankableOption = { recipe: r, qaSummary: CLEAN_QA, generationMode: 'freeform' };
    const delta: RankableOption = { recipe: r, qaSummary: CLEAN_QA, generationMode: 'delta' };
    const { recommendedIndex, scores } = rankOptions([freeform, delta]);
    expect(recommendedIndex).toBe(1);
    expect(scores[1]!.score - scores[0]!.score).toBeCloseTo(4, 5); // DELTA_BONUS
  });
});

describe('rankOptions — tie-break', () => {
  it('breaks a perfect tie toward the lower index', () => {
    const r = banner();
    const a: RankableOption = { recipe: r, qaSummary: CLEAN_QA, generationMode: 'freeform' };
    const b: RankableOption = { recipe: r, qaSummary: CLEAN_QA, generationMode: 'freeform' };
    const { recommendedIndex, scores } = rankOptions([a, b]);
    expect(scores[0]!.score).toBe(scores[1]!.score);
    expect(recommendedIndex).toBe(0);
  });
});

describe('rankOptions — badge assembly', () => {
  it("awards 'Passes all design QA' only when qaSummary is present with zero fails", () => {
    const withClean: RankableOption = { recipe: banner(), qaSummary: CLEAN_QA };
    const withFails: RankableOption = { recipe: banner(), qaSummary: { fails: 1, warns: 0, autofixes: 0 } };
    const withoutQa: RankableOption = { recipe: banner() }; // no qaSummary at all
    const { scores } = rankOptions([withClean, withFails, withoutQa]);
    expect(scores[0]!.badges).toContain('Passes all design QA');
    expect(scores[1]!.badges).not.toContain('Passes all design QA');
    expect(scores[2]!.badges).not.toContain('Passes all design QA');
  });

  it("awards 'Template-grounded' for delta options", () => {
    const { scores } = rankOptions([
      { recipe: banner(), qaSummary: CLEAN_QA, generationMode: 'delta' },
      { recipe: banner(), qaSummary: CLEAN_QA, generationMode: 'freeform' },
    ]);
    expect(scores[0]!.badges).toContain('Template-grounded');
    expect(scores[1]!.badges).not.toContain('Template-grounded');
  });

  it("awards 'Richest content' to the unique deepest option only", () => {
    const thin = banner({ blocks: [] });
    const rich = banner({ blocks: [{ kind: 'cta' }, { kind: 'cta' }, { kind: 'cta' }] });
    const { scores } = rankOptions([
      { recipe: thin, qaSummary: CLEAN_QA },
      { recipe: rich, qaSummary: CLEAN_QA },
    ]);
    expect(contentDepth(rich)).toBeGreaterThan(contentDepth(thin));
    expect(scores[1]!.badges).toContain('Richest content');
    expect(scores[0]!.badges).not.toContain('Richest content');
  });

  it("does not award 'Richest content' when the deepest option is not unique", () => {
    const r = banner({ blocks: [{ kind: 'cta' }] });
    const { scores } = rankOptions([
      { recipe: r, qaSummary: CLEAN_QA },
      { recipe: banner({ blocks: [{ kind: 'cta' }] }), qaSummary: CLEAN_QA },
    ]);
    expect(scores.every((s) => !s.badges.includes('Richest content'))).toBe(true);
  });
});

describe('rankOptions — edge cases', () => {
  it('handles an empty option list without throwing', () => {
    const result = rankOptions([]);
    expect(result.recommendedIndex).toBe(0);
    expect(result.scores).toEqual([]);
  });

  it('preserves the option index in every score entry', () => {
    const { scores } = rankOptions([
      { recipe: banner(), qaSummary: CLEAN_QA },
      { recipe: banner(), qaSummary: CLEAN_QA },
      { recipe: banner(), qaSummary: CLEAN_QA },
    ]);
    expect(scores.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('ranks without qaSummary (legacy options) using verify penalty alone', () => {
    const good: RankableOption = { recipe: banner() };
    const broken: RankableOption = { recipe: { type: 'theme.section' } as unknown as RecipeSpec };
    const { recommendedIndex } = rankOptions([broken, good]);
    expect(recommendedIndex).toBe(1);
  });
});

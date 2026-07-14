import { describe, expect, it, vi } from 'vitest';
import { RECIPE_SPEC_TYPES } from '@superapp/core';
import {
  RequirementSpecSchema,
  computeCoverageReport,
} from '@superapp/platform-contracts';
import {
  buildDeterministicRequirementSpec,
  extractRequirementSpec,
  mustHaveControlsForType,
} from '~/services/ai/requirement-spec.server';
import { searchSolutions, compactSpecForExemplar } from '~/services/ai/solution-search.server';
import type { ClassifyResult } from '~/services/ai/classify.server';

function classify(moduleType: string, confidenceScore: number): ClassifyResult {
  return {
    moduleType: moduleType as ClassifyResult['moduleType'],
    confidence: confidenceScore >= 0.8 ? 'high' : confidenceScore >= 0.55 ? 'medium' : 'low',
    confidenceScore,
    alternatives: [],
    reasons: [],
  };
}

describe('WS1 requirement extraction', () => {
  it('SC-001: a RequirementSpec validates for every RECIPE_SPEC_TYPES type', () => {
    for (const type of RECIPE_SPEC_TYPES) {
      const spec = buildDeterministicRequirementSpec({
        userRequest: `Build a ${type} module`,
        classification: classify(type, 0.9),
      });
      expect(() => RequirementSpecSchema.parse(spec)).not.toThrow();
      expect(spec.moduleType).toBe(type);
    }
  });

  it('derives mustHaveControls as config namespaces (not manifest ids) for theme.section', () => {
    const controls = mustHaveControlsForType('theme.section', 'basic');
    expect(controls).toContain('content');
    expect(controls).toContain('trigger');
    // Namespaces, not pack ids: page-targeting -> targeting, frequency-cap -> frequencyCap.
    expect(controls).toContain('targeting');
    expect(controls).toContain('frequencyCap');
    expect(controls).not.toContain('page-targeting');
    const advanced = mustHaveControlsForType('theme.section', 'advanced');
    expect(advanced).toContain('advancedCustom');
    expect(advanced).not.toContain('advanced-custom');
  });

  it('stays deterministic when confidence is high (no escalation call)', async () => {
    const escalate = vi.fn();
    const spec = await extractRequirementSpec({
      userRequest: 'A welcome popup',
      classification: classify('theme.section', 0.9),
      escalate,
    });
    expect(escalate).not.toHaveBeenCalled();
    expect(spec.source).toBe('deterministic');
  });

  it('escalates exactly once when confidence is low and merges the result', async () => {
    const escalate = vi.fn().mockResolvedValue({ audience: 'returning customers' });
    const spec = await extractRequirementSpec({
      userRequest: 'something vague',
      classification: classify('theme.section', 0.4),
      escalate,
    });
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(spec.source).toBe('llm_escalated');
    expect(spec.audience).toBe('returning customers');
  });
});

describe('WS1 solution search', () => {
  it('returns grounding examples for a known requirement', () => {
    const requirement = buildDeterministicRequirementSpec({
      userRequest: 'a discount for cart over $100',
      classification: classify('functions.discountRules', 0.9),
    });
    const result = searchSolutions(requirement, { topK: 3 });
    expect(result.startFrom.length).toBeGreaterThan(0);
    expect(result.startFrom.length).toBeLessThanOrEqual(3);
    // Highest score first.
    const scores = result.startFrom.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(result.grounding).toContain('Grounding examples');
  });

  it('feeds coverage gating: search surface intersects required controls', () => {
    const requirement = buildDeterministicRequirementSpec({
      userRequest: 'exit intent popup with countdown',
      classification: classify('theme.section', 0.9),
      tier: 'basic',
    });
    const report = computeCoverageReport({
      moduleType: requirement.moduleType,
      mustHaveControls: requirement.mustHaveControls,
      presentControls: ['content'],
    });
    expect(report.complete).toBe(false);
    expect(report.missing.length).toBeGreaterThan(0);
  });
});

describe('WS1 exemplar compaction', () => {
  it('strips undefined/null/empty-string/empty-array/empty-object recursively', () => {
    const json = compactSpecForExemplar({
      keep: 'x',
      nullish: null,
      undef: undefined,
      empty: '',
      emptyArr: [],
      emptyObj: {},
      nested: { drop: '', keep: 'y', deeper: { gone: [], stay: 1 } },
      list: ['a', '', null, { gone: {} }, { stay: 'b' }],
    });
    expect(JSON.parse(json)).toEqual({
      keep: 'x',
      nested: { keep: 'y', deeper: { stay: 1 } },
      list: ['a', { stay: 'b' }],
    });
  });

  it('retains falsy-but-meaningful values (0 and false) and minifies (no whitespace)', () => {
    const json = compactSpecForExemplar({ count: 0, on: false, label: 'q' });
    expect(json).toBe('{"count":0,"on":false,"label":"q"}');
    expect(json).not.toMatch(/\s/);
  });

  it('is stable: identical input yields byte-identical output', () => {
    const spec = { config: { a: 1, b: ['x', 'y'], c: { d: true } }, type: 'demo' };
    expect(compactSpecForExemplar(spec)).toBe(compactSpecForExemplar(spec));
  });

  it('yields a length signal the ~8,000-char exemplar cap can gate on', () => {
    const small = compactSpecForExemplar({ type: 'demo', config: { title: 'Hello' } });
    expect(small.length).toBeLessThan(8000);
    const huge = compactSpecForExemplar({ blocks: Array.from({ length: 500 }, (_, i) => ({ id: `block-${i}`, text: 'lorem ipsum dolor sit amet' })) });
    expect(huge.length).toBeGreaterThan(8000);
  });
});

describe('WS1 solution search — exemplar tiers', () => {
  it('promotes a very strong (score ≥ 6), same-type top match to Tier-1 (delta-editable)', () => {
    const requirement = buildDeterministicRequirementSpec({
      userRequest: 'a discount for cart over $100',
      classification: classify('functions.discountRules', 0.9),
    });
    const result = searchSolutions(requirement, { topK: 3 });
    expect(result.startFrom.length).toBeGreaterThan(0);
    const top = result.startFrom[0]!;
    // Precondition for Tier-1: score clears the promotion floor and the type matches.
    expect(top.score).toBeGreaterThanOrEqual(6);
    expect(top.moduleType).toBe(requirement.moduleType);
    expect(result.exemplar).toBeDefined();
    expect(result.exemplar?.tier).toBe(1);
    expect(result.exemplar?.templateId).toBe(top.templateId);
    expect(result.exemplar!.specJson.length).toBeLessThanOrEqual(8000);
    // Tier-1 spec must parse back to an object so the delta layer can instantiate it.
    expect(typeof JSON.parse(result.exemplar!.specJson)).toBe('object');
  });

  it('keeps a moderate (3 ≤ score < 6) top match as a Tier-2 exemplar (freeform reference)', () => {
    const requirement = buildDeterministicRequirementSpec({
      userRequest: 'give a percentage discount',
      classification: classify('functions.discountRules', 0.9),
    });
    const result = searchSolutions(requirement, { topK: 3 });
    const top = result.startFrom[0]!;
    expect(top.score).toBeGreaterThanOrEqual(3);
    expect(top.score).toBeLessThan(6);
    expect(result.exemplar?.tier).toBe(2);
    expect(result.exemplar?.templateId).toBe(top.templateId);
  });

  it('omits the exemplar for a weak match (top score below threshold), keeping hints', () => {
    // A bogus module type earns no type-match (+3) bonus; the token overlap alone
    // ("discount") scores below the exemplar threshold, so hints-only is expected.
    const weak = RequirementSpecSchema.parse({
      goal: 'discount',
      surface: 'unknown',
      moduleType: 'unknown.nonexistent',
    });
    const result = searchSolutions(weak, { topK: 3 });
    expect(result.startFrom.length).toBeGreaterThan(0);
    expect(result.grounding).toContain('Grounding examples');
    expect(result.exemplar).toBeUndefined();
  });
});

describe('WS1 solution search — quality-tier grading (Phase 6)', () => {
  it('boosts a tier:exemplar template above equally-relevant same-type peers', () => {
    // "analytics pixel" matches every pixel template on type (+3) and the shared
    // tags "analytics"/"pixel" (+2). The +1.5 exemplar boost breaks the tie in
    // favour of the hand-picked exemplar (ANA-PIXEL-01, the GA4 pixel).
    const requirement = buildDeterministicRequirementSpec({
      userRequest: 'analytics pixel',
      classification: classify('analytics.pixel', 0.9),
    });
    const result = searchSolutions(requirement, { topK: 5 });
    expect(result.startFrom.length).toBeGreaterThan(1);
    expect(result.startFrom[0]!.templateId).toBe('ANA-PIXEL-01');
    // The exemplar few-shot pick is that same exemplar template.
    expect(result.exemplar?.templateId).toBe('ANA-PIXEL-01');
  });

  it('never promotes a tier:floor template to a Tier-1 (delta-editable) exemplar', () => {
    // platform.extensionBlueprint has ONLY the coverage floor (COV-BP-01). Load the
    // query with that stub's own tokens so the raw score clears the Tier-1 floor
    // (≥6) AND the type matches — the two Tier-1 preconditions. The floor guard must
    // still hold it at Tier-2 (freeform reference), never Tier-1.
    const requirement = RequirementSpecSchema.parse({
      goal: 'scaffold a new theme app extension blueprint block surface',
      surface: 'admin',
      moduleType: 'platform.extensionBlueprint',
    });
    const result = searchSolutions(requirement, { topK: 3 });
    const top = result.startFrom[0]!;
    expect(top.templateId).toBe('COV-BP-01');
    // Preconditions for a would-be Tier-1 promotion are met…
    expect(top.score).toBeGreaterThanOrEqual(6);
    expect(top.moduleType).toBe(requirement.moduleType);
    // …but the floor guard forces Tier-2.
    expect(result.exemplar?.templateId).toBe('COV-BP-01');
    expect(result.exemplar?.tier).toBe(2);
  });

  it('penalizes floors so a real same-type template outranks the coverage stub', () => {
    // "back in stock restock waitlist" matches both the real MSG-CAMP-01 (standard)
    // and no floor for messaging.campaign — assert the real template leads and no
    // floor-tier entry appears ahead of it. (Floor penalty is −1; a real template of
    // equal token overlap always wins.)
    const requirement = buildDeterministicRequirementSpec({
      userRequest: 'back in stock restock waitlist alert email',
      classification: classify('messaging.campaign', 0.9),
    });
    const result = searchSolutions(requirement, { topK: 5 });
    expect(result.startFrom.length).toBeGreaterThan(0);
    // The top pick is a real (non-coverage) messaging template.
    expect(result.startFrom[0]!.templateId).not.toMatch(/^COV-/);
    expect(result.startFrom[0]!.moduleType).toBe('messaging.campaign');
  });
});

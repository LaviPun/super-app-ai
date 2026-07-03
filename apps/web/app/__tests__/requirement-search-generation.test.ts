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
import { searchSolutions } from '~/services/ai/solution-search.server';
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

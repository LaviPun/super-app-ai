import { describe, expect, it } from 'vitest';
import {
  RequirementSpecSchema,
  GenerationCoverageReportSchema,
  computeCoverageReport,
} from '../requirement-spec.js';

describe('requirement spec contracts', () => {
  it('parses a minimal requirement spec with defaults', () => {
    const spec = RequirementSpecSchema.parse({
      goal: 'Capture emails before exit',
      surface: 'storefront',
      moduleType: 'theme.section',
    });
    expect(spec.tier).toBe('basic');
    expect(spec.source).toBe('deterministic');
    expect(spec.mustHaveControls).toEqual([]);
  });

  it('computes full coverage when all controls present', () => {
    const report = computeCoverageReport({
      moduleType: 'theme.section',
      mustHaveControls: ['trigger', 'content', 'style'],
      presentControls: ['trigger', 'content', 'style', 'schedule'],
    });
    expect(report.complete).toBe(true);
    expect(report.ratio).toBe(1);
    expect(report.missing).toEqual([]);
    expect(GenerationCoverageReportSchema.parse(report)).toBeTruthy();
  });

  it('reports missing controls and a fractional ratio', () => {
    const report = computeCoverageReport({
      moduleType: 'theme.section',
      mustHaveControls: ['trigger', 'content', 'frequency-cap'],
      presentControls: ['content'],
    });
    expect(report.complete).toBe(false);
    expect(report.satisfied).toBe(1);
    expect(report.total).toBe(3);
    expect(report.ratio).toBeCloseTo(1 / 3);
    expect(report.missing).toEqual(['trigger', 'frequency-cap']);
  });

  it('treats zero required controls as complete', () => {
    const report = computeCoverageReport({
      moduleType: 'analytics.pixel',
      mustHaveControls: [],
      presentControls: [],
    });
    expect(report.complete).toBe(true);
    expect(report.ratio).toBe(1);
  });
});

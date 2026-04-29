import { describe, it, expect } from 'vitest';
import { applyTelemetryBudget } from '~/services/observability/telemetry-budget.server';

describe('applyTelemetryBudget', () => {
  it('keeps only allowlisted keys', () => {
    const result = applyTelemetryBudget({
      moduleId: 'm_1',
      secret: 'should-not-pass',
      target: 'THEME',
    });

    expect(result.moduleId).toBe('m_1');
    expect(result.target).toBe('THEME');
    expect(result.secret).toBeUndefined();
  });

  it('truncates long string values', () => {
    const long = 'x'.repeat(300);
    const result = applyTelemetryBudget({ error: long });
    const value = result.error as string;
    expect(value.length).toBeLessThan(long.length);
    expect(value.endsWith('...')).toBe(true);
  });

  it('caps blocked list cardinality', () => {
    const result = applyTelemetryBudget({
      blocked: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    });
    const blocked = result.blocked as string[];
    expect(blocked.length).toBe(8);
  });
});


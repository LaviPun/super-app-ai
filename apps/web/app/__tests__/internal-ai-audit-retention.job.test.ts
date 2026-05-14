import { describe, expect, it, vi } from 'vitest';
import {
  computeRetentionCutoff,
  resolveRetentionDays,
  runInternalAiAuditRetention,
} from '~/services/jobs/internal-ai-audit-retention.job';

describe('resolveRetentionDays', () => {
  it('returns the default when env value is missing', () => {
    expect(resolveRetentionDays(undefined)).toBe(90);
  });

  it('returns the default for non-numeric values', () => {
    expect(resolveRetentionDays('not-a-number')).toBe(90);
  });

  it('returns the default for non-positive values', () => {
    expect(resolveRetentionDays('0')).toBe(90);
    expect(resolveRetentionDays('-5')).toBe(90);
  });

  it('floors finite positive numeric values', () => {
    expect(resolveRetentionDays('14')).toBe(14);
    expect(resolveRetentionDays('14.7')).toBe(14);
  });
});

describe('computeRetentionCutoff', () => {
  it('subtracts retentionDays * 24h from now', () => {
    const now = new Date('2026-05-14T00:00:00.000Z');
    const cutoff = computeRetentionCutoff(7, now);
    expect(cutoff.toISOString()).toBe('2026-05-07T00:00:00.000Z');
  });

  it('coerces invalid retention to the default 90 days', () => {
    const now = new Date('2026-05-14T00:00:00.000Z');
    const cutoff = computeRetentionCutoff(0, now);
    expect(cutoff.toISOString()).toBe('2026-02-13T00:00:00.000Z');
  });
});

describe('runInternalAiAuditRetention', () => {
  it('delegates to store.purgeOldToolAudits with resolved retention', async () => {
    const purgeOldToolAudits = vi.fn(async () => 42);
    const result = await runInternalAiAuditRetention({
      store: { purgeOldToolAudits },
      retentionDays: 30,
    });
    expect(purgeOldToolAudits).toHaveBeenCalledWith(30);
    expect(result.deleted).toBe(42);
    expect(result.retentionDays).toBe(30);
    expect(typeof result.cutoff).toBe('string');
  });

  it('uses INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS env when no explicit override is provided', async () => {
    const purgeOldToolAudits = vi.fn(async () => 0);
    const original = process.env.INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS;
    process.env.INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS = '14';
    try {
      const result = await runInternalAiAuditRetention({ store: { purgeOldToolAudits } });
      expect(purgeOldToolAudits).toHaveBeenCalledWith(14);
      expect(result.retentionDays).toBe(14);
    } finally {
      if (original === undefined) {
        delete process.env.INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS;
      } else {
        process.env.INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS = original;
      }
    }
  });
});

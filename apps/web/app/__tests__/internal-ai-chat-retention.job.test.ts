import { describe, expect, it, vi } from 'vitest';
import {
  computeChatRetentionCutoff,
  resolveChatRetentionDays,
  runInternalAiChatRetention,
} from '~/services/jobs/internal-ai-chat-retention.job';

describe('resolveChatRetentionDays', () => {
  it('returns the default when env value is missing', () => {
    expect(resolveChatRetentionDays(undefined)).toBe(30);
  });

  it('returns the default for non-numeric values', () => {
    expect(resolveChatRetentionDays('not-a-number')).toBe(30);
  });

  it('returns the default for non-positive values', () => {
    expect(resolveChatRetentionDays('0')).toBe(30);
    expect(resolveChatRetentionDays('-5')).toBe(30);
  });

  it('floors finite positive numeric values', () => {
    expect(resolveChatRetentionDays('14')).toBe(14);
    expect(resolveChatRetentionDays('14.7')).toBe(14);
  });
});

describe('computeChatRetentionCutoff', () => {
  it('subtracts retentionDays * 24h from now', () => {
    const now = new Date('2026-05-14T00:00:00.000Z');
    const cutoff = computeChatRetentionCutoff(7, now);
    expect(cutoff.toISOString()).toBe('2026-05-07T00:00:00.000Z');
  });

  it('coerces invalid retention to the default 30 days', () => {
    const now = new Date('2026-05-14T00:00:00.000Z');
    const cutoff = computeChatRetentionCutoff(0, now);
    expect(cutoff.toISOString()).toBe('2026-04-14T00:00:00.000Z');
  });
});

describe('runInternalAiChatRetention', () => {
  it('delegates to store.purgeOldMessages with resolved retention', async () => {
    const purgeOldMessages = vi.fn(async () => 42);
    const result = await runInternalAiChatRetention({
      store: { purgeOldMessages },
      retentionDays: 30,
    });
    expect(purgeOldMessages).toHaveBeenCalledWith(30);
    expect(result.deleted).toBe(42);
    expect(result.retentionDays).toBe(30);
    expect(typeof result.cutoff).toBe('string');
  });

  it('uses INTERNAL_AI_CHAT_MESSAGE_RETENTION_DAYS env when no explicit override is provided', async () => {
    const purgeOldMessages = vi.fn(async () => 0);
    const original = process.env.INTERNAL_AI_CHAT_MESSAGE_RETENTION_DAYS;
    process.env.INTERNAL_AI_CHAT_MESSAGE_RETENTION_DAYS = '14';
    try {
      const result = await runInternalAiChatRetention({ store: { purgeOldMessages } });
      expect(purgeOldMessages).toHaveBeenCalledWith(14);
      expect(result.retentionDays).toBe(14);
    } finally {
      if (original === undefined) {
        delete process.env.INTERNAL_AI_CHAT_MESSAGE_RETENTION_DAYS;
      } else {
        process.env.INTERNAL_AI_CHAT_MESSAGE_RETENTION_DAYS = original;
      }
    }
  });
});

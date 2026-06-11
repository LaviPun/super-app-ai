import { describe, expect, it } from 'vitest';
import { normalizeFallbackTarget } from '~/routes/internal.model-setup';

describe('normalizeFallbackTarget', () => {
  it('drops fallback when it matches active target', () => {
    expect(normalizeFallbackTarget('localMachine', 'localMachine')).toBeUndefined();
    expect(normalizeFallbackTarget('modalRemote', 'modalRemote')).toBeUndefined();
  });

  it('keeps valid fallback when different from active target', () => {
    expect(normalizeFallbackTarget('localMachine', 'modalRemote')).toBe('modalRemote');
    expect(normalizeFallbackTarget('modalRemote', 'localMachine')).toBe('localMachine');
  });

  it('returns undefined for empty or invalid fallback values', () => {
    expect(normalizeFallbackTarget('localMachine', '')).toBeUndefined();
    expect(normalizeFallbackTarget('localMachine', 'invalid')).toBeUndefined();
    expect(normalizeFallbackTarget('localMachine', undefined)).toBeUndefined();
  });
});

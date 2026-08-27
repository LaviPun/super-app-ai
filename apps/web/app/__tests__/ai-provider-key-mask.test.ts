import { describe, expect, it } from 'vitest';
import { maskApiKeyPreview } from '~/services/internal/ai-provider-kinds';

describe('maskApiKeyPreview (internal AI Providers key-reveal masking)', () => {
  it('keeps the first segment (through the 2nd dash) and the last 4 chars, hiding the middle', () => {
    const key = 'sk-ant-api03-abcXYZdefUVWcAAA';
    const preview = maskApiKeyPreview(key);
    expect(preview).toBe('sk-ant-…cAAA');
  });

  it('never includes the raw middle of the key', () => {
    const key = 'sk-ant-api03-SUPER-SECRET-MIDDLE-cAAA';
    const preview = maskApiKeyPreview(key);
    expect(preview).not.toContain('SUPER-SECRET-MIDDLE');
  });

  it('falls back to the single dash-delimited prefix for single-dash keys', () => {
    const key = 'sk-abcdefghijklmnop1234';
    const preview = maskApiKeyPreview(key);
    expect(preview).toBe('sk-…1234');
  });

  it('falls back to a short fixed prefix for dashless keys', () => {
    const key = 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234';
    const preview = maskApiKeyPreview(key);
    expect(preview).toBe('AIza…1234');
  });

  it('masks very short keys entirely rather than exposing them via prefix+last4 overlap', () => {
    expect(maskApiKeyPreview('short1')).not.toContain('short1');
    expect(maskApiKeyPreview('short1')).toMatch(/^•+$/);
  });

  it('handles empty/undefined gracefully', () => {
    expect(maskApiKeyPreview('')).toBe('—');
  });
});

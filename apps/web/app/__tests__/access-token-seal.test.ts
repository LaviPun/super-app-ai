import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('Shop access token sealing', () => {
  it('seals to an enc1: ciphertext that round-trips', async () => {
    const { sealAccessToken, openAccessToken } = await import(
      '~/services/shops/access-token.server'
    );
    const sealed = sealAccessToken('shpua_test_token_1234567890');
    expect(sealed.startsWith('enc1:')).toBe(true);
    expect(sealed).not.toContain('shpua_test_token');
    expect(openAccessToken(sealed)).toBe('shpua_test_token_1234567890');
  });

  it('is idempotent on already-sealed values', async () => {
    const { sealAccessToken, openAccessToken } = await import(
      '~/services/shops/access-token.server'
    );
    const once = sealAccessToken('shpua_abc');
    expect(sealAccessToken(once)).toBe(once);
    expect(openAccessToken(once)).toBe('shpua_abc');
  });

  it('passes through legacy plaintext and empty strings', async () => {
    const { sealAccessToken, openAccessToken } = await import(
      '~/services/shops/access-token.server'
    );
    expect(openAccessToken('shpua_legacy_plain')).toBe('shpua_legacy_plain');
    expect(openAccessToken('')).toBe('');
    expect(openAccessToken(null)).toBe('');
    expect(sealAccessToken('')).toBe('');
  });
});

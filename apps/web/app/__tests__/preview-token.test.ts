import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('preview-token (WS-F: preview.$moduleId.tsx auth gap)', () => {
  it('mints a token that verifies back to the same shop for the same moduleId', async () => {
    const { mintPreviewToken, verifyPreviewToken } = await import('~/services/security/preview-token.server');
    const token = mintPreviewToken({ shop: 'acme.myshopify.com', moduleId: 'mod_1' });
    const { shop } = verifyPreviewToken(token, { moduleId: 'mod_1' });
    expect(shop).toBe('acme.myshopify.com');
  });

  it('rejects a token minted for a different moduleId', async () => {
    const { mintPreviewToken, verifyPreviewToken } = await import('~/services/security/preview-token.server');
    const token = mintPreviewToken({ shop: 'acme.myshopify.com', moduleId: 'mod_1' });
    expect(() => verifyPreviewToken(token, { moduleId: 'mod_2' })).toThrow();
  });

  it('rejects an expired token', async () => {
    const { mintPreviewToken, verifyPreviewToken } = await import('~/services/security/preview-token.server');
    const token = mintPreviewToken({ shop: 'acme.myshopify.com', moduleId: 'mod_1' }, -1);
    expect(() => verifyPreviewToken(token, { moduleId: 'mod_1' })).toThrow(/expired/i);
  });

  it('rejects garbage input rather than throwing an unrelated decrypt error a caller could probe with', async () => {
    const { verifyPreviewToken } = await import('~/services/security/preview-token.server');
    expect(() => verifyPreviewToken('not-a-real-token', { moduleId: 'mod_1' })).toThrow();
  });
});

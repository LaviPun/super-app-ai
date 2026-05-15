import { describe, expect, it } from 'vitest';
import {
  isSensitiveHeader,
  persistJsonSafely,
  redact,
  safeMeta,
} from '~/services/observability/redact.server';

describe('observability redaction helpers', () => {
  it('covers expanded sensitive headers', () => {
    expect(isSensitiveHeader('x-shopify-access-token')).toBe(true);
    expect(isSensitiveHeader('x-api-key')).toBe(true);
    expect(isSensitiveHeader('proxy-authorization')).toBe(true);
    expect(isSensitiveHeader('x-amz-security-token')).toBe(true);
    expect(isSensitiveHeader('x-csrf-token')).toBe(true);
    expect(isSensitiveHeader('content-type')).toBe(false);
  });

  it('safeMeta deep-redacts objects and arrays', () => {
    const meta = safeMeta({
      request: {
        headers: {
          authorization: 'Bearer very-secret-token',
          'x-shopify-access-token': 'shpat_secret',
        },
      },
      payload: [
        { email: 'user@example.com', accessToken: 'shpat_nested' },
      ],
    });

    expect(meta).toBeDefined();
    expect(meta?.request).toBeDefined();
    const payload = meta?.payload as Array<{ email: string; accessToken: string }>;
    expect(payload[0]?.email).toBe('[REDACTED_EMAIL]');
    expect(payload[0]?.accessToken).toBe('[REDACTED]');
  });

  it('safeMeta wraps primitive inputs safely', () => {
    expect(safeMeta('shpat_token_leak')).toEqual({ value: '[REDACTED_TOKEN]' });
    expect(safeMeta(null)).toBeUndefined();
    expect(redact(['hello@example.com'])).toEqual(['[REDACTED_EMAIL]']);
  });

  it('persistJsonSafely drops contact keys when strict and flagged', () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldStrict = process.env.STRICT_PII_REDACTION;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.STRICT_PII_REDACTION;

      const persisted = persistJsonSafely(
        {
          orderId: 'ord_1',
          email: 'buyer@example.com',
          profile: { phone: '1234567890', note: 'ok' },
        },
        { piiFlags: { contains_contact_pii: true } },
      );
      const parsed = JSON.parse(persisted) as Record<string, unknown>;

      expect(parsed.orderId).toBe('ord_1');
      expect(parsed.email).toBeUndefined();
      expect(parsed.profile).toEqual({ note: 'ok' });
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldStrict === undefined) delete process.env.STRICT_PII_REDACTION;
      else process.env.STRICT_PII_REDACTION = oldStrict;
    }
  });

  it('persistJsonSafely keeps redacted contact keys when strict disabled', () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldStrict = process.env.STRICT_PII_REDACTION;
    try {
      process.env.NODE_ENV = 'production';
      process.env.STRICT_PII_REDACTION = '0';

      const persisted = persistJsonSafely(
        { email: 'buyer@example.com' },
        { piiFlags: { contains_contact_pii: true } },
      );
      const parsed = JSON.parse(persisted) as Record<string, unknown>;

      expect(parsed.email).toBe('[REDACTED_EMAIL]');
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldStrict === undefined) delete process.env.STRICT_PII_REDACTION;
      else process.env.STRICT_PII_REDACTION = oldStrict;
    }
  });
});

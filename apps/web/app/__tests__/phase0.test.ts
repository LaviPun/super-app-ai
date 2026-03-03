import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _resetEnvForTest, validateEnv, getEnv } from '~/env.server';
import { AppError, toErrorResponse } from '~/services/errors/app-error.server';
import { redact, redactString, safeErrorMeta } from '~/services/observability/redact.server';

// --- helpers ---

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    original[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const VALID_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'file:./test.db',
  SHOPIFY_API_KEY: 'shopify-key',
  SHOPIFY_API_SECRET: 'shopify-secret',
  SHOPIFY_APP_URL: 'https://example.com',
  SCOPES: 'read_products',
  ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  INTERNAL_ADMIN_PASSWORD: 'admin-password-123',
  INTERNAL_ADMIN_SESSION_SECRET: 'session-secret-12345',
};

// ===========================================================================
// Env validation
// ===========================================================================

describe('validateEnv', () => {
  beforeEach(() => _resetEnvForTest());
  afterEach(() => _resetEnvForTest());

  it('accepts a fully valid env', () => {
    withEnv(VALID_ENV, () => {
      const env = validateEnv();
      expect(env.SHOPIFY_API_KEY).toBe('shopify-key');
      expect(env.DEFAULT_RETENTION_DAYS).toBe(30);
    });
  });

  it('parses DEFAULT_RETENTION_DAYS from string', () => {
    withEnv({ ...VALID_ENV, DEFAULT_RETENTION_DAYS: '90' }, () => {
      const env = validateEnv();
      expect(env.DEFAULT_RETENTION_DAYS).toBe(90);
    });
  });

  it('throws when SHOPIFY_API_KEY is missing', () => {
    const env = { ...VALID_ENV, SHOPIFY_API_KEY: undefined as unknown as string };
    withEnv(env, () => {
      expect(() => validateEnv()).toThrow(/SHOPIFY_API_KEY/);
    });
  });

  it('throws when SHOPIFY_APP_URL is not a URL', () => {
    withEnv({ ...VALID_ENV, SHOPIFY_APP_URL: 'not-a-url' }, () => {
      expect(() => validateEnv()).toThrow(/SHOPIFY_APP_URL/);
    });
  });

  it('throws when ENCRYPTION_KEY is too short', () => {
    withEnv({ ...VALID_ENV, ENCRYPTION_KEY: 'c2hvcnQ=' }, () => {
      expect(() => validateEnv()).toThrow(/ENCRYPTION_KEY/);
    });
  });

  it('caches result on second call', () => {
    withEnv(VALID_ENV, () => {
      const first = validateEnv();
      const second = validateEnv();
      expect(first).toBe(second);
    });
  });

  it('getEnv() auto-validates in test env', () => {
    withEnv(VALID_ENV, () => {
      const env = getEnv();
      expect(env.DATABASE_URL).toBe('file:./test.db');
    });
  });
});

// ===========================================================================
// AppError / consistent error shape
// ===========================================================================

describe('AppError', () => {
  it('creates correct HTTP status for each code', () => {
    expect(new AppError({ code: 'NOT_FOUND', message: 'x' }).status).toBe(404);
    expect(new AppError({ code: 'VALIDATION_ERROR', message: 'x' }).status).toBe(422);
    expect(new AppError({ code: 'UNAUTHORIZED', message: 'x' }).status).toBe(401);
    expect(new AppError({ code: 'RATE_LIMITED', message: 'x' }).status).toBe(429);
    expect(new AppError({ code: 'INTERNAL_ERROR', message: 'x' }).status).toBe(500);
  });

  it('generates a requestId', () => {
    const err = new AppError({ code: 'NOT_FOUND', message: 'not found' });
    expect(err.requestId).toMatch(/^req_[0-9a-f]{16}$/);
  });

  it('accepts a custom requestId', () => {
    const err = new AppError({ code: 'NOT_FOUND', message: 'nope', requestId: 'req_custom' });
    expect(err.requestId).toBe('req_custom');
  });

  it('toPayload returns consistent shape', () => {
    const err = new AppError({ code: 'FORBIDDEN', message: 'no access', details: { field: 'shopId' } });
    const payload = err.toPayload();
    expect(payload.error).toBe('FORBIDDEN');
    expect(payload.message).toBe('no access');
    expect(payload.requestId).toBeTruthy();
    expect(payload.details).toEqual({ field: 'shopId' });
  });

  it('toResponse returns a Response with correct status', async () => {
    const err = new AppError({ code: 'NOT_FOUND', message: 'missing' });
    const res = err.toResponse();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('NOT_FOUND');
    expect(body.requestId).toBeTruthy();
  });
});

describe('toErrorResponse', () => {
  it('preserves AppError identity', async () => {
    const err = new AppError({ code: 'RATE_LIMITED', message: 'too fast' });
    const res = toErrorResponse(err);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('RATE_LIMITED');
  });

  it('wraps unknown errors as INTERNAL_ERROR', async () => {
    const res = toErrorResponse(new Error('boom'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(body.requestId).toBeTruthy();
  });
});

// ===========================================================================
// Redaction utilities
// ===========================================================================

describe('redactString', () => {
  it('redacts Shopify access tokens', () => {
    const s = 'token=shpat_abc123XYZdef456GHI and more text';
    expect(redactString(s)).toContain('[REDACTED_TOKEN]');
    expect(redactString(s)).not.toContain('shpat_');
  });

  it('redacts Bearer tokens in Authorization strings', () => {
    const s = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig';
    expect(redactString(s)).toContain('Bearer [REDACTED]');
    expect(redactString(s)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts email addresses', () => {
    const s = 'user is hello@example.com and admin@shop.io';
    const out = redactString(s);
    expect(out).not.toContain('@example.com');
    expect(out).toContain('[REDACTED_EMAIL]');
  });

  it('leaves safe strings unchanged', () => {
    const s = 'Module published successfully for shop test.myshopify.com';
    expect(redactString(s)).toBe(s);
  });
});

describe('redact (deep object)', () => {
  it('redacts known sensitive key names', () => {
    const obj = { accessToken: 'shpat_secret', shop: 'test.myshopify.com' };
    const out = redact(obj) as any;
    expect(out.accessToken).toBe('[REDACTED]');
    expect(out.shop).toBe('test.myshopify.com');
  });

  it('redacts nested sensitive keys', () => {
    const obj = { provider: { apiKeyEnc: 'enc-value', name: 'openai' } };
    const out = redact(obj) as any;
    expect(out.provider.apiKeyEnc).toBe('[REDACTED]');
    expect(out.provider.name).toBe('openai');
  });

  it('handles arrays', () => {
    const arr = [{ password: 'p@ss', name: 'x' }];
    const out = redact(arr) as any[];
    expect(out[0].password).toBe('[REDACTED]');
    expect(out[0].name).toBe('x');
  });

  it('handles null/undefined values safely', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});

describe('safeErrorMeta', () => {
  it('redacts token from error message', () => {
    const err = new Error('Failed with token shpat_abc123xyz');
    const meta = safeErrorMeta(err);
    expect(meta.message).not.toContain('shpat_');
    expect(meta.message).toContain('[REDACTED_TOKEN]');
  });

  it('handles non-Error throws', () => {
    const meta = safeErrorMeta('plain string error');
    expect(meta.message).toBe('plain string error');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({ log: vi.fn(async () => {}) }));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));

import {
  parseAllowedEmails,
  evaluateSsoIdentity,
  auditSsoDenied,
} from '~/internal-admin/sso-allowlist.server';

beforeEach(() => vi.clearAllMocks());

describe('parseAllowedEmails', () => {
  it('splits on commas, trims, lowercases, drops empties', () => {
    expect(parseAllowedEmails(' Alice@Example.com , bob@x.io ,, ')).toEqual([
      'alice@example.com',
      'bob@x.io',
    ]);
  });

  it('returns [] for undefined / empty', () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails('')).toEqual([]);
  });
});

describe('evaluateSsoIdentity', () => {
  const allowed = ['alice@example.com'];

  it('allows an exact case-insensitive match with verified email', () => {
    const v = evaluateSsoIdentity({ email: 'Alice@Example.COM', email_verified: true }, allowed);
    expect(v).toEqual({ ok: true, email: 'alice@example.com' });
  });

  it('allows when the email_verified claim is absent (claim optional)', () => {
    expect(evaluateSsoIdentity({ email: 'alice@example.com' }, allowed).ok).toBe(true);
  });

  it('denies when the email claim is missing', () => {
    const v = evaluateSsoIdentity({ name: 'no email' }, allowed);
    expect(v).toMatchObject({ ok: false, email: null, reason: 'missing_email_claim' });
  });

  it('denies when email_verified is present and not true', () => {
    const v = evaluateSsoIdentity({ email: 'alice@example.com', email_verified: false }, allowed);
    expect(v).toMatchObject({ ok: false, reason: 'email_not_verified' });
  });

  it('denies an email not on the allowlist', () => {
    const v = evaluateSsoIdentity({ email: 'mallory@evil.com', email_verified: true }, allowed);
    expect(v).toMatchObject({ ok: false, email: 'mallory@evil.com', reason: 'not_on_allowlist' });
  });

  it('denies everyone when the allowlist is empty (fail closed)', () => {
    const v = evaluateSsoIdentity({ email: 'alice@example.com', email_verified: true }, []);
    expect(v).toMatchObject({ ok: false, reason: 'allowlist_empty' });
  });
});

describe('auditSsoDenied', () => {
  it('writes an INTERNAL_ADMIN LOGIN denial with email + reason + ip', async () => {
    const request = new Request('https://app.test/internal/sso/callback', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    await auditSsoDenied(request, { email: 'mallory@evil.com', reason: 'not_on_allowlist' });
    expect(hoisted.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'INTERNAL_ADMIN',
        action: 'LOGIN',
        resource: 'internal:sso',
        ip: '203.0.113.9',
        details: expect.objectContaining({ outcome: 'denied', email: 'mallory@evil.com', reason: 'not_on_allowlist' }),
      }),
    );
  });

  it('never throws when the audit write fails', async () => {
    hoisted.log.mockRejectedValueOnce(new Error('db down'));
    await expect(
      auditSsoDenied(new Request('https://app.test/x'), { email: null, reason: 'missing_email_claim' }),
    ).resolves.toBeUndefined();
  });
});

describe('env validation: SSO requires an allowlist', () => {
  const BASE_ENV = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://x',
    SHOPIFY_API_KEY: 'k',
    SHOPIFY_API_SECRET: 's',
    SHOPIFY_APP_URL: 'https://app.test',
    SCOPES: 'write_products',
    ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    INTERNAL_ADMIN_PASSWORD: 'longpassword',
    INTERNAL_ADMIN_SESSION_SECRET: 'vitest-internal-admin-session-secret-32',
  } as const;

  it('boot fails when INTERNAL_SSO_ISSUER is set without INTERNAL_SSO_ALLOWED_EMAILS', async () => {
    const env = await import('~/env.server');
    const saved = { ...process.env };
    try {
      for (const [k, v] of Object.entries(BASE_ENV)) process.env[k] = v as string;
      process.env.INTERNAL_SSO_ISSUER = 'https://idp.example.com';
      delete process.env.INTERNAL_SSO_ALLOWED_EMAILS;
      env._resetEnvForTest();
      expect(() => env.validateEnv()).toThrow(/INTERNAL_SSO_ALLOWED_EMAILS/);
    } finally {
      process.env = saved;
      env._resetEnvForTest();
    }
  });

  it('boot succeeds with issuer + allowlist, and without SSO at all', async () => {
    const env = await import('~/env.server');
    const saved = { ...process.env };
    try {
      for (const [k, v] of Object.entries(BASE_ENV)) process.env[k] = v as string;
      process.env.INTERNAL_SSO_ISSUER = 'https://idp.example.com';
      process.env.INTERNAL_SSO_ALLOWED_EMAILS = 'alice@example.com';
      env._resetEnvForTest();
      expect(() => env.validateEnv()).not.toThrow();

      delete process.env.INTERNAL_SSO_ISSUER;
      delete process.env.INTERNAL_SSO_ALLOWED_EMAILS;
      env._resetEnvForTest();
      expect(() => env.validateEnv()).not.toThrow();
    } finally {
      process.env = saved;
      env._resetEnvForTest();
    }
  });
});

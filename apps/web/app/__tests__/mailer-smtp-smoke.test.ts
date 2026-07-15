import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Smoke test for the SMTP branch of the DB-first mailer. We point the transporter
 * at a reserved `.invalid` host that never resolves, so the send fails fast with
 * ENOTFOUND rather than making a real network call — proving the mailer degrades
 * to a graceful { sent:false } instead of throwing.
 */

const hoisted = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSettings: { findUnique: hoisted.findUnique },
  }),
}));

// ENCRYPTION_KEY isn't needed here (no encrypted fields set), but keep decrypt safe.
vi.mock('~/services/security/crypto.server', () => ({
  decryptJson: () => {
    throw new Error('no key in test');
  },
}));

import { sendEmail, resolveMailerStatus } from '~/services/notifications/mailer.server';

beforeEach(() => {
  hoisted.findUnique.mockReset();
});

describe('mailer SMTP branch', () => {
  it('returns { sent:false } without throwing when the SMTP host is unreachable', async () => {
    hoisted.findUnique.mockResolvedValue({
      emailProvider: 'smtp',
      emailFrom: 'alerts@example.com',
      emailApiUrl: null,
      emailApiKeyEnc: null,
      smtpHost: 'smtp.unreachable.invalid',
      smtpPort: 587,
      smtpUser: null,
      smtpPassEnc: null,
      smtpSecure: false,
    });

    const result = await sendEmail({
      to: 'dest@example.com',
      subject: 'smoke',
      html: '<p>hi</p>',
    });

    expect(result.sent).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('reports configured=true for a complete SMTP config via resolveMailerStatus', async () => {
    hoisted.findUnique.mockResolvedValue({
      emailProvider: 'smtp',
      emailFrom: 'alerts@example.com',
      emailApiUrl: null,
      emailApiKeyEnc: null,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpUser: 'user',
      smtpPassEnc: null,
      smtpSecure: true,
    });

    const status = await resolveMailerStatus();
    expect(status).toEqual({ configured: true, provider: 'smtp', from: 'alerts@example.com' });
  });

  it('reports not configured when no sender and no credentials', async () => {
    hoisted.findUnique.mockResolvedValue(null);
    const prevFrom = process.env.EMAIL_FROM;
    const prevKey = process.env.EMAIL_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_API_KEY;

    const status = await resolveMailerStatus();
    expect(status.configured).toBe(false);

    if (prevFrom !== undefined) process.env.EMAIL_FROM = prevFrom;
    if (prevKey !== undefined) process.env.EMAIL_API_KEY = prevKey;
  });
});

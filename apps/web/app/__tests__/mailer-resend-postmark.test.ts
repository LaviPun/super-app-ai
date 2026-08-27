import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task 9 (WS-INT): mailer.server.ts gains `resend` and `postmark` as full DB-config
 * email providers, matching the already-shipped smtp/sendgrid/generic pattern
 * (DB-first, env fallback, AES-GCM-encrypted API key). Mirrors mailer-smtp-smoke's
 * mocking style — mocks getPrisma + decryptJson and exercises the public sendEmail.
 */

const hoisted = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSettings: { findUnique: hoisted.findUnique },
  }),
}));

vi.mock('~/services/security/crypto.server', () => ({
  decryptJson: () => ({ apiKey: 'test-key' }),
}));

beforeEach(() => {
  hoisted.findUnique.mockReset();
  vi.unstubAllGlobals();
});

describe('mailer.server — resend', () => {
  it('POSTs to api.resend.com/emails with Bearer auth and the resend payload shape', async () => {
    hoisted.findUnique.mockResolvedValue({
      emailProvider: 'resend',
      emailFrom: 'ops@superapp.dev',
      emailApiUrl: null,
      emailApiKeyEnc: 'enc-blob',
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPassEnc: null,
      smtpSecure: true,
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { sendEmail } = await import('~/services/notifications/mailer.server');
    const result = await sendEmail({ to: 'x@y.com', subject: 's', html: '<p>h</p>', text: 't' });

    expect(result.sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ from: 'ops@superapp.dev', to: ['x@y.com'], subject: 's', html: '<p>h</p>' });
  });

  it('reports sent:false with the upstream status on a non-2xx resend response', async () => {
    hoisted.findUnique.mockResolvedValue({
      emailProvider: 'resend',
      emailFrom: 'ops@superapp.dev',
      emailApiUrl: null,
      emailApiKeyEnc: 'enc-blob',
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPassEnc: null,
      smtpSecure: true,
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad request', { status: 422 })));

    const { sendEmail } = await import('~/services/notifications/mailer.server');
    const result = await sendEmail({ to: 'x@y.com', subject: 's', html: '<p>h</p>' });

    expect(result.sent).toBe(false);
    expect(result.error).toMatch(/422/);
  });
});

describe('mailer.server — postmark', () => {
  it('POSTs to api.postmarkapp.com/email with X-Postmark-Server-Token header and PascalCase payload', async () => {
    hoisted.findUnique.mockResolvedValue({
      emailProvider: 'postmark',
      emailFrom: 'ops@superapp.dev',
      emailApiUrl: null,
      emailApiKeyEnc: 'enc-blob',
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPassEnc: null,
      smtpSecure: true,
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ MessageID: 'abc' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { sendEmail } = await import('~/services/notifications/mailer.server');
    const result = await sendEmail({ to: 'x@y.com', subject: 's', html: '<p>h</p>', text: 't' });

    expect(result.sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.postmarkapp.com/email');
    expect(init.headers).toMatchObject({ 'X-Postmark-Server-Token': 'test-key' });
    expect(init.headers).not.toHaveProperty('Authorization');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ From: 'ops@superapp.dev', To: 'x@y.com', Subject: 's', HtmlBody: '<p>h</p>', TextBody: 't' });
  });

  it('joins multiple recipients with a comma for postmark (its To field is a single string)', async () => {
    hoisted.findUnique.mockResolvedValue({
      emailProvider: 'postmark',
      emailFrom: 'ops@superapp.dev',
      emailApiUrl: null,
      emailApiKeyEnc: 'enc-blob',
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPassEnc: null,
      smtpSecure: true,
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ MessageID: 'abc' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { sendEmail } = await import('~/services/notifications/mailer.server');
    await sendEmail({ to: ['a@x.com', 'b@x.com'], subject: 's', html: '<p>h</p>' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.To).toBe('a@x.com,b@x.com');
  });
});

describe('mailer.server — resolveMailerStatus recognizes the new providers', () => {
  it('reports configured=true for resend when an API key is present', async () => {
    hoisted.findUnique.mockResolvedValue({
      emailProvider: 'resend',
      emailFrom: 'ops@superapp.dev',
      emailApiUrl: null,
      emailApiKeyEnc: 'enc-blob',
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPassEnc: null,
      smtpSecure: true,
    });
    const { resolveMailerStatus } = await import('~/services/notifications/mailer.server');
    const status = await resolveMailerStatus();
    expect(status).toEqual({ configured: true, provider: 'resend', from: 'ops@superapp.dev' });
  });
});

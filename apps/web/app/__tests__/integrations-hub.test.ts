import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INTEGRATION_TILES } from '~/components/admin/integration-tiles';

describe('Integrations Hub tile registry', () => {
  it('every tile has a unique id and a simple-icons slug', () => {
    const ids = INTEGRATION_TILES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of INTEGRATION_TILES) {
      expect(t.simpleIconSlug.length).toBeGreaterThan(0);
    }
  });

  it('categories are exactly AI_PROVIDER and OPS_SERVICE', () => {
    for (const t of INTEGRATION_TILES) {
      expect(['AI_PROVIDER', 'OPS_SERVICE']).toContain(t.category);
    }
  });
});

/**
 * Task 9 (WS-INT): internal.integrations.tsx's `saveEmail`/`testEmail` action
 * intents — secrets are encrypted (never stored/echoed in plaintext), every
 * save/test is audited via a typed ActivityAction, and a real send failure
 * surfaces the real error (D8 — no fake "sent" toast).
 */
describe('internal.integrations action — email tile', () => {
  const { requireInternalAdminMock, appSettingsUpsertMock, activityLogMock, encryptJsonMock, sendEmailMock } = vi.hoisted(() => ({
    requireInternalAdminMock: vi.fn(async (..._args: unknown[]) => undefined),
    appSettingsUpsertMock: vi.fn(async (..._args: unknown[]) => ({})),
    activityLogMock: vi.fn(async (..._args: unknown[]) => ({})),
    encryptJsonMock: vi.fn((value: unknown) => `enc(${JSON.stringify(value)})`),
    sendEmailMock: vi.fn(async (..._args: unknown[]): Promise<{ sent: boolean; error?: string }> => ({ sent: true })),
  }));

  vi.mock('~/internal-admin/session.server', () => ({
    requireInternalAdmin: (...args: unknown[]) => requireInternalAdminMock(...args),
  }));
  vi.mock('~/db.server', () => ({
    getPrisma: () => ({
      appSettings: {
        findUnique: vi.fn(async () => null),
        upsert: (...args: unknown[]) => appSettingsUpsertMock(...args),
      },
    }),
  }));
  vi.mock('~/services/activity/activity.service', () => ({
    ActivityLogService: class {
      log = (...args: unknown[]) => activityLogMock(...args);
    },
  }));
  vi.mock('~/services/security/crypto.server', () => ({
    encryptJson: (value: unknown) => encryptJsonMock(value),
    decryptJson: () => ({ apiKey: 'x', pass: 'x' }),
  }));
  vi.mock('~/services/observability/sentry.server', () => ({
    captureMessage: vi.fn(),
  }));
  vi.mock('~/services/notifications/mailer.server', () => ({
    sendEmail: (...args: unknown[]) => sendEmailMock(...args),
    resolveMailerStatus: vi.fn(async () => ({ configured: true, provider: 'sendgrid', from: 'ops@example.com' })),
  }));

  function formRequest(fields: Record<string, string>): Request {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return new Request('https://x/internal/integrations', { method: 'POST', body: fd });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue({ sent: true });
  });

  it('saveEmail encrypts a submitted API key and audits the save with a typed action', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({
      request: formRequest({ intent: 'saveEmail', provider: 'resend', from: 'ops@example.com', apiKey: 'sk_live_123' }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(true);

    expect(encryptJsonMock).toHaveBeenCalledWith({ apiKey: 'sk_live_123' });
    expect(appSettingsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ emailProvider: 'resend', emailApiKeyEnc: 'enc({"apiKey":"sk_live_123"})' }),
      }),
    );
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPS_INTEGRATION_SAVED', resource: 'integration:email' }),
    );
  });

  it('saveEmail leaves the existing encrypted key untouched when apiKey is left blank', async () => {
    const { action } = await import('~/routes/internal.integrations');
    await action({ request: formRequest({ intent: 'saveEmail', provider: 'resend', from: 'ops@example.com' }) });

    expect(encryptJsonMock).not.toHaveBeenCalled();
    const [{ update }] = appSettingsUpsertMock.mock.calls[0] as unknown as [{ update: Record<string, unknown> }];
    expect(update).not.toHaveProperty('emailApiKeyEnc');
  });

  it('rejects an unknown provider without writing anything', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'saveEmail', provider: 'not-a-real-provider' }) });
    expect(res.status).toBe(400);
    expect(appSettingsUpsertMock).not.toHaveBeenCalled();
  });

  it('testEmail sends a real test message and audits OPS_INTEGRATION_TESTED', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'testEmail', to: 'me@example.com' }) });
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'me@example.com' }));
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPS_INTEGRATION_TESTED', resource: 'integration:email', details: { sent: true } }),
    );
  });

  it('testEmail surfaces the real upstream error instead of a fake success (D8)', async () => {
    sendEmailMock.mockResolvedValue({ sent: false, error: 'SMTP auth failed' });
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'testEmail', to: 'me@example.com' }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('SMTP auth failed');
  });

  it('testEmail rejects a missing/invalid recipient before calling sendEmail', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'testEmail', to: 'not-an-email' }) });
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

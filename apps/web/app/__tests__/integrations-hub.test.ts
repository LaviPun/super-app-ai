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

  it('includes the slack-ops tile (Task 10)', () => {
    const ids = INTEGRATION_TILES.map((t) => t.id);
    expect(ids).toContain('slack-ops');
  });

  it('includes the uptimerobot tile (Task 11)', () => {
    const ids = INTEGRATION_TILES.map((t) => t.id);
    expect(ids).toContain('uptimerobot');
  });

  it('includes the healthchecks tile (Task 12)', () => {
    const ids = INTEGRATION_TILES.map((t) => t.id);
    expect(ids).toContain('healthchecks');
  });
});

/**
 * Task 9 (WS-INT): internal.integrations.tsx's `saveEmail`/`testEmail` action
 * intents — secrets are encrypted (never stored/echoed in plaintext), every
 * save/test is audited via a typed ActivityAction, and a real send failure
 * surfaces the real error (D8 — no fake "sent" toast).
 *
 * Task 10 (Slack tile) reuses this same mock setup — vi.mock calls are
 * hoisted to module scope regardless of which describe block they're written
 * in, so every module used by any tile in this file is mocked once, here, at
 * file scope. `appSettingsFindUniqueMock` is a controllable per-test mock
 * (unlike a fixed `async () => null`) because the Slack test-connection
 * intent needs to read back a configured webhook.
 */
const {
  requireInternalAdminMock,
  appSettingsFindUniqueMock,
  appSettingsUpsertMock,
  activityLogMock,
  encryptJsonMock,
  decryptJsonMock,
  sendEmailMock,
  sendSlackAlertMock,
} = vi.hoisted(() => ({
  requireInternalAdminMock: vi.fn(async (..._args: unknown[]) => undefined),
  appSettingsFindUniqueMock: vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown> | null> => null),
  appSettingsUpsertMock: vi.fn(async (..._args: unknown[]) => ({})),
  activityLogMock: vi.fn(async (..._args: unknown[]) => ({})),
  encryptJsonMock: vi.fn((value: unknown) => `enc(${JSON.stringify(value)})`),
  decryptJsonMock: vi.fn((_enc: string) => ({ apiKey: 'test-key', pass: 'x', url: 'https://hooks.slack.com/services/a/b/c' })),
  sendEmailMock: vi.fn(async (..._args: unknown[]): Promise<{ sent: boolean; error?: string }> => ({ sent: true })),
  sendSlackAlertMock: vi.fn(async (..._args: unknown[]): Promise<{ sent: boolean; error?: string }> => ({ sent: true })),
}));

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: (...args: unknown[]) => requireInternalAdminMock(...args),
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSettings: {
      findUnique: (...args: unknown[]) => appSettingsFindUniqueMock(...args),
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
  decryptJson: (enc: string) => decryptJsonMock(enc),
}));
vi.mock('~/services/observability/sentry.server', () => ({
  captureMessage: vi.fn(),
}));
vi.mock('~/services/notifications/mailer.server', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  resolveMailerStatus: vi.fn(async () => ({ configured: true, provider: 'sendgrid', from: 'ops@example.com' })),
}));
vi.mock('~/services/observability/ops-alert-slack.server', () => ({
  sendSlackAlert: (...args: unknown[]) => sendSlackAlertMock(...args),
}));

function formRequest(fields: Record<string, string>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request('https://x/internal/integrations', { method: 'POST', body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  requireInternalAdminMock.mockResolvedValue(undefined);
  appSettingsFindUniqueMock.mockResolvedValue(null);
  sendEmailMock.mockResolvedValue({ sent: true });
  sendSlackAlertMock.mockResolvedValue({ sent: true });
  decryptJsonMock.mockImplementation((_enc: string) => ({
    apiKey: 'test-key',
    pass: 'x',
    url: 'https://hooks.slack.com/services/a/b/c',
  }));
});

describe('internal.integrations action — email tile', () => {
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

/**
 * Task 10 (WS-INT): Slack ops-alert tile — webhook config (encrypted,
 * validated as a real Slack incoming-webhook URL), a real test-send via the
 * Task 3 sender, and the rolling-window threshold fields.
 */
describe('internal.integrations action — slack tile', () => {
  it('saveSlackWebhook encrypts the URL and audits the save', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({
      request: formRequest({ intent: 'saveSlackWebhook', webhookUrl: 'https://hooks.slack.com/services/a/b/c' }),
    });
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
    expect(encryptJsonMock).toHaveBeenCalledWith({ url: 'https://hooks.slack.com/services/a/b/c' });
    expect(appSettingsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ opsSlackWebhookUrlEnc: 'enc({"url":"https://hooks.slack.com/services/a/b/c"})' }),
      }),
    );
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPS_INTEGRATION_SAVED', resource: 'integration:slack' }),
    );
  });

  it('saveSlackWebhook rejects a non-Slack URL without writing anything', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'saveSlackWebhook', webhookUrl: 'https://evil.example.com/x' }) });
    expect(res.status).toBe(400);
    expect(appSettingsUpsertMock).not.toHaveBeenCalled();
  });

  it('saveSlackWebhook clears the webhook when submitted blank', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'saveSlackWebhook', webhookUrl: '' }) });
    expect(((await res.json()) as { ok?: boolean }).ok).toBe(true);
    expect(appSettingsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ opsSlackWebhookUrlEnc: null }) }),
    );
  });

  it('testSlackWebhook sends a real test message via sendSlackAlert and audits the test', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ opsSlackWebhookUrlEnc: 'enc(...)' });
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'testSlackWebhook' }) });
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
    expect(sendSlackAlertMock).toHaveBeenCalledWith('https://hooks.slack.com/services/a/b/c', expect.any(String));
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPS_INTEGRATION_TESTED', resource: 'integration:slack', details: { sent: true } }),
    );
  });

  it('testSlackWebhook refuses honestly when no webhook is configured (D8)', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ opsSlackWebhookUrlEnc: null });
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'testSlackWebhook' }) });
    expect(res.status).toBe(400);
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
  });

  it('testSlackWebhook surfaces the real upstream error instead of a fake success (D8)', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ opsSlackWebhookUrlEnc: 'enc(...)' });
    sendSlackAlertMock.mockResolvedValueOnce({ sent: false, error: 'Slack webhook responded 404' });
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'testSlackWebhook' }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('Slack webhook responded 404');
  });

  it('saveAlertThresholds saves a valid count/window and audits the save', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({
      request: formRequest({ intent: 'saveAlertThresholds', thresholdCount: '5', thresholdWindowMin: '30' }),
    });
    expect(((await res.json()) as { ok?: boolean }).ok).toBe(true);
    expect(appSettingsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ update: { opsAlertThresholdCount: 5, opsAlertThresholdWindowMin: 30 } }),
    );
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPS_INTEGRATION_SAVED', resource: 'integration:alert-thresholds' }),
    );
  });

  it('saveAlertThresholds rejects a non-positive-integer count/window without writing anything', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({
      request: formRequest({ intent: 'saveAlertThresholds', thresholdCount: '0', thresholdWindowMin: '15' }),
    });
    expect(res.status).toBe(400);
    expect(appSettingsUpsertMock).not.toHaveBeenCalled();
  });
});

/**
 * Task 11 (WS-INT): UptimeRobot tile — DB-stored read-only key, live status
 * from the real UptimeRobot Monitors API (loader-level and test-connection).
 * Decision G5: no boot-time coupling, so the key is DB-config like email/Slack,
 * not env-reflect like Sentry.
 */
describe('internal.integrations — UptimeRobot tile', () => {
  it('loader resolves status "up" when the API returns status:2', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ uptimeRobotApiKeyEnc: 'enc(...)', uptimeRobotMonitorId: '8123456' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ stat: 'ok', monitors: [{ status: 2 }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { loader } = await import('~/routes/internal.integrations');
    const data = (await (await loader({ request: new Request('https://x/internal/integrations') })).json()) as {
      uptimeRobot: { status: string };
    };
    expect(data.uptimeRobot.status).toBe('up');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.uptimerobot.com/v2/getMonitors',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('loader resolves status "down" when the API returns status:9', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ uptimeRobotApiKeyEnc: 'enc(...)', uptimeRobotMonitorId: '8123456' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ stat: 'ok', monitors: [{ status: 9 }] }), { status: 200 })));
    const { loader } = await import('~/routes/internal.integrations');
    const data = (await (await loader({ request: new Request('https://x/internal/integrations') })).json()) as {
      uptimeRobot: { status: string };
    };
    expect(data.uptimeRobot.status).toBe('down');
  });

  it('loader reports "not_configured" (never throws) when no key/monitor id is set', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ uptimeRobotApiKeyEnc: null, uptimeRobotMonitorId: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { loader } = await import('~/routes/internal.integrations');
    const data = (await (await loader({ request: new Request('https://x/internal/integrations') })).json()) as {
      uptimeRobot: { status: string };
    };
    expect(data.uptimeRobot.status).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loader reports "error" (never throws) on a network failure — honest status, no fake green', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ uptimeRobotApiKeyEnc: 'enc(...)', uptimeRobotMonitorId: '8123456' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const { loader } = await import('~/routes/internal.integrations');
    const res = await loader({ request: new Request('https://x/internal/integrations') });
    const data = (await res.json()) as { uptimeRobot: { status: string; error?: string } };
    expect(data.uptimeRobot.status).toBe('error');
    expect(data.uptimeRobot.error).toBeTruthy();
  });

  it('saveUptimeRobot encrypts the key and audits the save', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({
      request: formRequest({ intent: 'saveUptimeRobot', apiKey: 'ur-readonly-key', monitorId: '8123456' }),
    });
    expect(((await res.json()) as { ok?: boolean }).ok).toBe(true);
    expect(encryptJsonMock).toHaveBeenCalledWith({ apiKey: 'ur-readonly-key' });
    expect(appSettingsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ uptimeRobotMonitorId: '8123456' }) }),
    );
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPS_INTEGRATION_SAVED', resource: 'integration:uptimerobot' }),
    );
  });

  it('testUptimeRobot surfaces the real upstream error instead of a fake success (D8)', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ uptimeRobotApiKeyEnc: 'enc(...)', uptimeRobotMonitorId: '8123456' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'testUptimeRobot' }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/401/);
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPS_INTEGRATION_TESTED', resource: 'integration:uptimerobot' }),
    );
  });
});

/**
 * Task 12 (WS-INT): Healthchecks.io tile — DB-stored read-only key, live
 * status from the real Healthchecks.io Management API. Per the plan's
 * binding rule 4: the cron ping itself (PR #13) is not yet merged, so a
 * "new"/"not_configured" status here is expected right now, not a bug —
 * the tile's honesty is about reflecting the real API response, not about
 * pretending the ping already exists.
 */
describe('internal.integrations — Healthchecks.io tile', () => {
  it('loader resolves status "up" from a real 200 response', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ healthchecksApiKeyEnc: 'enc(...)', healthchecksCheckSlug: 'superapp-cron' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'up' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { loader } = await import('~/routes/internal.integrations');
    const data = (await (await loader({ request: new Request('https://x/internal/integrations') })).json()) as {
      healthchecks: { status: string };
    };
    expect(data.healthchecks.status).toBe('up');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://healthchecks.io/api/v3/checks/superapp-cron',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Api-Key': 'test-key' }) }),
    );
  });

  it('loader reports "not_configured" (never throws) when no key is set', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ healthchecksApiKeyEnc: null, healthchecksCheckSlug: 'superapp-cron' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { loader } = await import('~/routes/internal.integrations');
    const data = (await (await loader({ request: new Request('https://x/internal/integrations') })).json()) as {
      healthchecks: { status: string };
    };
    expect(data.healthchecks.status).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loader reports "error" (never throws) on a non-2xx response — honest status, no fake green', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ healthchecksApiKeyEnc: 'enc(...)', healthchecksCheckSlug: 'superapp-cron' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    const { loader } = await import('~/routes/internal.integrations');
    const data = (await (await loader({ request: new Request('https://x/internal/integrations') })).json()) as {
      healthchecks: { status: string; error?: string };
    };
    expect(data.healthchecks.status).toBe('error');
    expect(data.healthchecks.error).toMatch(/401/);
  });

  it('saveHealthchecks encrypts the key and audits the save', async () => {
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({
      request: formRequest({ intent: 'saveHealthchecks', apiKey: 'hc-readonly-key', checkSlug: 'superapp-cron' }),
    });
    expect(((await res.json()) as { ok?: boolean }).ok).toBe(true);
    expect(encryptJsonMock).toHaveBeenCalledWith({ apiKey: 'hc-readonly-key' });
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPS_INTEGRATION_SAVED', resource: 'integration:healthchecks' }),
    );
  });

  it('testHealthchecks surfaces the real upstream error instead of a fake success (D8)', async () => {
    appSettingsFindUniqueMock.mockResolvedValueOnce({ healthchecksApiKeyEnc: 'enc(...)', healthchecksCheckSlug: 'superapp-cron' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ETIMEDOUT'); }));
    const { action } = await import('~/routes/internal.integrations');
    const res = await action({ request: formRequest({ intent: 'testHealthchecks' }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/ETIMEDOUT/);
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPS_INTEGRATION_TESTED', resource: 'integration:healthchecks' }),
    );
  });
});

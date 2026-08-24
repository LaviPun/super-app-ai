import { json } from '@remix-run/node';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { captureMessage } from '~/services/observability/sentry.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { encryptJson, decryptJson } from '~/services/security/crypto.server';
import { sendEmail, resolveMailerStatus } from '~/services/notifications/mailer.server';
import { sendSlackAlert } from '~/services/observability/ops-alert-slack.server';
import { INTEGRATION_TILES, type IntegrationCategory } from '~/components/admin/integration-tiles';
import { IntegrationIcon } from '~/components/admin/integration-icon';
import {
  useAdminCtx,
  PageHead,
  Card,
  CardHead,
  EmptyState,
  Badge,
  Btn,
  KV,
  Field,
  Input,
  Select,
  Toggle,
  formatRelativeTime,
} from '~/components/admin/page-kit';

const EMAIL_PROVIDERS = ['smtp', 'sendgrid', 'generic', 'resend', 'postmark'] as const;
type EmailProviderChoice = (typeof EMAIL_PROVIDERS)[number];

/** '••••••••xyz1' convention, matching AiProviderService.getApiKeyMasked. Never
 * returns the decrypted secret — only its last 4 characters. */
function maskSecret(enc: string | null | undefined, field: string): string | null {
  if (!enc) return null;
  try {
    const decoded = decryptJson<Record<string, string>>(enc);
    const value = decoded[field];
    if (!value) return null;
    if (value.length < 4) return '••••';
    return '••••••••' + value.slice(-4);
  } catch {
    return '••••';
  }
}

// Task 11: bounded-timeout, never-throw status read against the real
// UptimeRobot Monitors API — matches the SLACK_TIMEOUT_MS convention in
// ops-alert-slack.server.ts. This read-only status key has no boot-time
// coupling (Decision G5), so both the loader (passive reflect) and the
// test-connection action call the same helper.
const UPSTREAM_STATUS_TIMEOUT_MS = 10_000;

type UptimeRobotStatus = { status: 'up' | 'down' | 'unknown' | 'not_configured' | 'error'; error?: string };

async function resolveUptimeRobotStatus(apiKeyEnc: string | null | undefined, monitorId: string | null | undefined): Promise<UptimeRobotStatus> {
  if (!apiKeyEnc || !monitorId) return { status: 'not_configured' };
  let apiKey: string;
  try {
    apiKey = decryptJson<{ apiKey: string }>(apiKeyEnc).apiKey;
  } catch {
    return { status: 'error', error: 'Stored UptimeRobot API key could not be decrypted' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_STATUS_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ api_key: apiKey, monitors: monitorId, format: 'json' }),
      signal: controller.signal,
    });
    if (!res.ok) return { status: 'error', error: `UptimeRobot API responded ${res.status}` };
    const body = (await res.json()) as { stat?: string; monitors?: Array<{ status?: number }>; error?: { message?: string } };
    if (body.stat !== 'ok') return { status: 'error', error: body.error?.message ?? 'UptimeRobot API returned an error' };
    const raw = body.monitors?.[0]?.status;
    if (raw === 2) return { status: 'up' };
    if (raw === 9) return { status: 'down' };
    return { status: 'unknown' };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  AI_PROVIDER: 'AI providers',
  OPS_SERVICE: 'Ops services',
};

const CATEGORIES: IntegrationCategory[] = ['AI_PROVIDER', 'OPS_SERVICE'];

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const appSettings = await prisma.appSettings.findUnique({
    where: { id: 'singleton' },
    select: {
      sentryLastTestedAt: true,
      emailProvider: true,
      emailFrom: true,
      emailApiUrl: true,
      emailApiKeyEnc: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPassEnc: true,
      smtpSecure: true,
      opsSlackWebhookUrlEnc: true,
      opsAlertThresholdCount: true,
      opsAlertThresholdWindowMin: true,
      uptimeRobotApiKeyEnc: true,
      uptimeRobotMonitorId: true,
    },
  });
  const mailerStatus = await resolveMailerStatus();
  const uptimeRobotStatus = await resolveUptimeRobotStatus(appSettings?.uptimeRobotApiKeyEnc, appSettings?.uptimeRobotMonitorId);
  return json({
    tiles: INTEGRATION_TILES,
    sentry: {
      configured: Boolean(process.env.SENTRY_DSN),
      lastTestedAt: appSettings?.sentryLastTestedAt ? appSettings.sentryLastTestedAt.toISOString() : null,
    },
    email: {
      provider: (appSettings?.emailProvider as EmailProviderChoice | null) ?? null,
      from: appSettings?.emailFrom ?? null,
      apiUrl: appSettings?.emailApiUrl ?? null,
      smtpHost: appSettings?.smtpHost ?? null,
      smtpPort: appSettings?.smtpPort ?? null,
      smtpUser: appSettings?.smtpUser ?? null,
      smtpSecure: appSettings?.smtpSecure ?? true,
      apiKeyMasked: maskSecret(appSettings?.emailApiKeyEnc, 'apiKey'),
      smtpPassMasked: maskSecret(appSettings?.smtpPassEnc, 'pass'),
      status: mailerStatus,
    },
    slack: {
      configured: Boolean(appSettings?.opsSlackWebhookUrlEnc),
      webhookMasked: maskSecret(appSettings?.opsSlackWebhookUrlEnc, 'url'),
      thresholdCount: appSettings?.opsAlertThresholdCount ?? 3,
      thresholdWindowMin: appSettings?.opsAlertThresholdWindowMin ?? 15,
    },
    uptimeRobot: {
      configured: Boolean(appSettings?.uptimeRobotApiKeyEnc && appSettings?.uptimeRobotMonitorId),
      monitorId: appSettings?.uptimeRobotMonitorId ?? null,
      apiKeyMasked: maskSecret(appSettings?.uptimeRobotApiKeyEnc, 'apiKey'),
      ...uptimeRobotStatus,
    },
  });
}

type ActionResult = { ok: true; message: string } | { error: string };

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const activity = new ActivityLogService();

  if (intent === 'testSentry') {
    // Never throws — sentry.server.ts falls back to a console log when SENTRY_DSN is unset.
    captureMessage('SuperApp ops: Sentry test event', 'info', { source: 'internal-integrations-hub' });
    const configured = Boolean(process.env.SENTRY_DSN);
    const prisma = getPrisma();
    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', sentryLastTestedAt: new Date() },
      update: { sentryLastTestedAt: new Date() },
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_TESTED', resource: 'integration:sentry', details: { configured } });
    return json<ActionResult>({
      ok: true,
      message: configured ? 'Test event sent to Sentry' : 'SENTRY_DSN is not set — event was only logged to the server console',
    });
  }

  if (intent === 'saveEmail') {
    const prisma = getPrisma();
    const providerRaw = String(form.get('provider') ?? '').trim().toLowerCase();
    const provider = EMAIL_PROVIDERS.includes(providerRaw as EmailProviderChoice) ? providerRaw : null;
    if (!provider) {
      return json<ActionResult>({ error: `Unknown email provider: ${providerRaw}` }, { status: 400 });
    }
    const from = String(form.get('from') ?? '').trim() || null;
    const apiUrl = String(form.get('apiUrl') ?? '').trim() || null;
    const smtpHost = String(form.get('smtpHost') ?? '').trim() || null;
    const smtpPortRaw = String(form.get('smtpPort') ?? '').trim();
    const smtpPort = smtpPortRaw ? Number.parseInt(smtpPortRaw, 10) : null;
    const smtpUser = String(form.get('smtpUser') ?? '').trim() || null;
    const smtpSecure = form.get('smtpSecure') === 'on';

    // Secrets are masked in the UI and never re-submitted as their real value
    // unless the operator actually typed a new one — an empty field here means
    // "leave the existing encrypted value alone", matching internal.ai-providers.tsx's
    // saveAccount pattern (`if (apiKey) { ...update... }`).
    const apiKey = String(form.get('apiKey') ?? '').trim();
    const smtpPass = String(form.get('smtpPass') ?? '').trim();

    const data: Record<string, unknown> = {
      emailProvider: provider,
      emailFrom: from,
      emailApiUrl: apiUrl,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpSecure,
    };
    if (apiKey) data.emailApiKeyEnc = encryptJson({ apiKey });
    if (smtpPass) data.smtpPassEnc = encryptJson({ pass: smtpPass });

    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_SAVED', resource: 'integration:email', details: { provider } });
    return json<ActionResult>({ ok: true, message: 'Email settings saved' });
  }

  if (intent === 'testEmail') {
    const to = String(form.get('to') ?? '').trim();
    if (!to || !to.includes('@')) {
      return json<ActionResult>({ error: 'Enter a valid test recipient address' }, { status: 400 });
    }
    const result = await sendEmail({
      to,
      subject: 'SuperApp Integrations Hub — test email',
      html: '<p>This is a test email from the SuperApp Integrations Hub.</p>',
      text: 'This is a test email from the SuperApp Integrations Hub.',
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_TESTED', resource: 'integration:email', details: { sent: result.sent } });
    // D8 (no silent failures): surface the real upstream error, never a fake "sent" toast.
    return result.sent
      ? json<ActionResult>({ ok: true, message: `Test email sent to ${to}` })
      : json<ActionResult>({ error: result.error ?? 'Email send failed' }, { status: 400 });
  }

  if (intent === 'saveSlackWebhook') {
    const url = String(form.get('webhookUrl') ?? '').trim();
    if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) {
      return json<ActionResult>({ error: 'Must be a Slack incoming-webhook URL (https://hooks.slack.com/services/...)' }, { status: 400 });
    }
    const prisma = getPrisma();
    const data = { opsSlackWebhookUrlEnc: url ? encryptJson({ url }) : null };
    await prisma.appSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...data }, update: data });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_SAVED', resource: 'integration:slack' });
    return json<ActionResult>({ ok: true, message: url ? 'Slack webhook saved' : 'Slack webhook cleared' });
  }

  if (intent === 'testSlackWebhook') {
    const prisma = getPrisma();
    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' }, select: { opsSlackWebhookUrlEnc: true } });
    if (!settings?.opsSlackWebhookUrlEnc) {
      return json<ActionResult>({ error: 'No Slack webhook configured' }, { status: 400 });
    }
    let url: string;
    try {
      url = decryptJson<{ url: string }>(settings.opsSlackWebhookUrlEnc).url;
    } catch {
      return json<ActionResult>({ error: 'Stored Slack webhook could not be decrypted' }, { status: 400 });
    }
    const result = await sendSlackAlert(url, 'SuperApp Ops Hub: this is a test message.');
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_TESTED', resource: 'integration:slack', details: { sent: result.sent } });
    // D8 (no silent failures): surface the real upstream error, never a fake "sent" toast.
    return result.sent
      ? json<ActionResult>({ ok: true, message: 'Test message sent to Slack' })
      : json<ActionResult>({ error: result.error ?? 'Slack send failed' }, { status: 400 });
  }

  if (intent === 'saveAlertThresholds') {
    const count = Number(form.get('thresholdCount') ?? 3);
    const windowMin = Number(form.get('thresholdWindowMin') ?? 15);
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(windowMin) || windowMin < 1) {
      return json<ActionResult>({ error: 'Threshold count and window must be positive integers' }, { status: 400 });
    }
    const prisma = getPrisma();
    const data = { opsAlertThresholdCount: count, opsAlertThresholdWindowMin: windowMin };
    await prisma.appSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...data }, update: data });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_SAVED', resource: 'integration:alert-thresholds' });
    return json<ActionResult>({ ok: true, message: 'Alert thresholds saved' });
  }

  if (intent === 'saveUptimeRobot') {
    const apiKey = String(form.get('apiKey') ?? '').trim();
    const monitorId = String(form.get('monitorId') ?? '').trim() || null;
    const prisma = getPrisma();
    const data: Record<string, unknown> = { uptimeRobotMonitorId: monitorId };
    if (apiKey) data.uptimeRobotApiKeyEnc = encryptJson({ apiKey });
    await prisma.appSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...data }, update: data });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_SAVED', resource: 'integration:uptimerobot' });
    return json<ActionResult>({ ok: true, message: 'UptimeRobot settings saved' });
  }

  if (intent === 'testUptimeRobot') {
    const prisma = getPrisma();
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'singleton' },
      select: { uptimeRobotApiKeyEnc: true, uptimeRobotMonitorId: true },
    });
    const result = await resolveUptimeRobotStatus(settings?.uptimeRobotApiKeyEnc, settings?.uptimeRobotMonitorId);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_TESTED', resource: 'integration:uptimerobot', details: { status: result.status } });
    if (result.status === 'error' || result.status === 'not_configured') {
      return json<ActionResult>({ error: result.error ?? 'UptimeRobot is not configured' }, { status: 400 });
    }
    return json<ActionResult>({ ok: true, message: `UptimeRobot monitor is ${result.status}` });
  }

  return json<ActionResult>({ error: `Unknown intent: ${intent}` }, { status: 400 });
}

/** Submit an intent to this route's action; toast the server's response (error styling on failure). */
function useIntentSubmit() {
  const ctx = useAdminCtx();
  const fetcher = useFetcher<ActionResult>();
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if ('error' in fetcher.data) ctx.toast(fetcher.data.error, true);
    else ctx.toast(fetcher.data.message);
  }, [fetcher.state, fetcher.data, ctx]);

  const submit = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fetcher.submit(fd, { method: 'post' });
  };
  return { submit, busy: fetcher.state !== 'idle' };
}

interface EmailTileState {
  provider: EmailProviderChoice | null;
  from: string | null;
  apiUrl: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpSecure: boolean;
  apiKeyMasked: string | null;
  smtpPassMasked: string | null;
  status: { configured: boolean; provider: string | null; from: string | null };
}

function EmailTileBody({
  email,
  onSave,
  onTest,
  busy,
}: {
  email: EmailTileState;
  onSave: (fields: Record<string, string>) => void;
  onTest: (to: string) => void;
  busy: boolean;
}) {
  const [provider, setProvider] = useState<EmailProviderChoice>(email.provider ?? 'sendgrid');
  const [from, setFrom] = useState(email.from ?? '');
  const [apiUrl, setApiUrl] = useState(email.apiUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [smtpHost, setSmtpHost] = useState(email.smtpHost ?? '');
  const [smtpPort, setSmtpPort] = useState(email.smtpPort ? String(email.smtpPort) : '');
  const [smtpUser, setSmtpUser] = useState(email.smtpUser ?? '');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(email.smtpSecure);
  const [testTo, setTestTo] = useState('');

  const isSmtp = provider === 'smtp';
  const isGeneric = provider === 'generic';
  const usesApiKey = provider === 'sendgrid' || provider === 'generic' || provider === 'resend' || provider === 'postmark';

  return (
    <>
      <KV
        rows={[
          ['Status', <Badge key="s" tone={email.status.configured ? 'success' : 'warning'} dot>{email.status.configured ? 'Configured' : 'Not configured'}</Badge>],
          ['Active provider', email.status.provider ?? 'none'],
        ]}
      />
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <Field label="Provider">
          <Select
            options={EMAIL_PROVIDERS.map((p) => ({ value: p, label: p }))}
            value={provider}
            onChange={(e) => setProvider(e.target.value as EmailProviderChoice)}
          />
        </Field>
        <Field label="From address">
          <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="ops@example.com" />
        </Field>
        {isSmtp ? (
          <>
            <Field label="SMTP host">
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
            </Field>
            <Field label="SMTP port" optional>
              <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
            </Field>
            <Field label="SMTP user" optional>
              <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
            </Field>
            <Field label="SMTP password" help={email.smtpPassMasked ? `Currently set: ${email.smtpPassMasked}` : 'Not set'}>
              <Input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="Leave blank to keep existing" />
            </Field>
            <Field label="Use TLS">
              <Toggle checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
            </Field>
          </>
        ) : (
          <>
            {isGeneric ? (
              <Field label="API URL">
                <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.example.com/send" />
              </Field>
            ) : null}
            {usesApiKey ? (
              <Field label="API key" help={email.apiKeyMasked ? `Currently set: ${email.apiKeyMasked}` : 'Not set'}>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Leave blank to keep existing" />
              </Field>
            ) : null}
          </>
        )}
        <div className="row-3">
          <Btn
            size="sm"
            loading={busy}
            onClick={() =>
              onSave({
                provider,
                from,
                apiUrl,
                apiKey,
                smtpHost,
                smtpPort,
                smtpUser,
                smtpPass,
                smtpSecure: smtpSecure ? 'on' : '',
              })
            }
          >
            Save
          </Btn>
          <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="test recipient@example.com" style={{ maxWidth: 220 }} />
          <Btn size="sm" variant="secondary" loading={busy} onClick={() => onTest(testTo)}>
            Send test email
          </Btn>
        </div>
      </div>
    </>
  );
}

function SentryTileBody({ configured, lastTestedAt, onTest, busy }: { configured: boolean; lastTestedAt: string | null; onTest: () => void; busy: boolean }) {
  return (
    <>
      <KV
        rows={[
          ['Status', <Badge key="s" tone={configured ? 'success' : 'warning'} dot>{configured ? 'Configured (env)' : 'Not configured'}</Badge>],
          ['Last test event', lastTestedAt ? formatRelativeTime(lastTestedAt) : 'never'],
        ]}
      />
      <div style={{ marginTop: 10 }}>
        <Btn size="sm" onClick={onTest} loading={busy}>
          Send test event
        </Btn>
      </div>
    </>
  );
}

interface SlackTileState {
  configured: boolean;
  webhookMasked: string | null;
  thresholdCount: number;
  thresholdWindowMin: number;
}

function SlackTileBody({
  slack,
  onSaveWebhook,
  onTest,
  onSaveThresholds,
  busy,
}: {
  slack: SlackTileState;
  onSaveWebhook: (webhookUrl: string) => void;
  onTest: () => void;
  onSaveThresholds: (count: string, windowMin: string) => void;
  busy: boolean;
}) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [count, setCount] = useState(String(slack.thresholdCount));
  const [windowMin, setWindowMin] = useState(String(slack.thresholdWindowMin));

  return (
    <>
      <KV
        rows={[
          ['Status', <Badge key="s" tone={slack.configured ? 'success' : 'warning'} dot>{slack.configured ? 'Configured' : 'Not configured'}</Badge>],
          ['Webhook', slack.webhookMasked ?? 'not set'],
        ]}
      />
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <Field label="Incoming-webhook URL" help={slack.webhookMasked ? `Currently set: ${slack.webhookMasked}` : 'Not set'}>
          <Input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
          />
        </Field>
        <div className="row-3">
          <Btn size="sm" loading={busy} onClick={() => onSaveWebhook(webhookUrl)}>
            Save
          </Btn>
          <Btn size="sm" variant="secondary" loading={busy} onClick={onTest}>
            Send test message
          </Btn>
        </div>
        <div className="row-3" style={{ marginTop: 4 }}>
          <Field label="Alert after N failures" help="Sentry always fires immediately; Slack/email wait for this threshold">
            <Input value={count} onChange={(e) => setCount(e.target.value)} style={{ maxWidth: 90 }} />
          </Field>
          <Field label="within minutes">
            <Input value={windowMin} onChange={(e) => setWindowMin(e.target.value)} style={{ maxWidth: 90 }} />
          </Field>
          <Btn size="sm" variant="secondary" loading={busy} onClick={() => onSaveThresholds(count, windowMin)}>
            Save thresholds
          </Btn>
        </div>
      </div>
    </>
  );
}

// Shared status-badge vocabulary for the read-only status tiles (Tasks 11-12).
const OPS_STATUS_TONE: Record<string, 'success' | 'warning' | 'critical' | 'info'> = {
  up: 'success',
  down: 'critical',
  grace: 'warning',
  paused: 'warning',
  new: 'info',
  unknown: 'info',
  not_configured: 'info',
  error: 'critical',
};

const OPS_STATUS_LABEL: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  grace: 'Grace period',
  paused: 'Paused',
  new: 'Never pinged yet',
  unknown: 'Unknown',
  not_configured: 'Not configured',
  error: 'Error',
};

interface UptimeRobotTileState {
  configured: boolean;
  monitorId: string | null;
  apiKeyMasked: string | null;
  status: string;
  error?: string;
}

function UptimeRobotTileBody({
  uptimeRobot,
  onSave,
  onTest,
  busy,
}: {
  uptimeRobot: UptimeRobotTileState;
  onSave: (apiKey: string, monitorId: string) => void;
  onTest: () => void;
  busy: boolean;
}) {
  const [apiKey, setApiKey] = useState('');
  const [monitorId, setMonitorId] = useState(uptimeRobot.monitorId ?? '');

  return (
    <>
      <KV
        rows={[
          [
            'Live status',
            <Badge key="s" tone={OPS_STATUS_TONE[uptimeRobot.status] ?? 'info'} dot>
              {OPS_STATUS_LABEL[uptimeRobot.status] ?? uptimeRobot.status}
            </Badge>,
          ],
          uptimeRobot.error ? ['Last error', uptimeRobot.error] : false,
        ]}
      />
      <p className="t-xs t-muted" style={{ marginTop: 6 }}>
        The monitor itself is configured in the UptimeRobot dashboard against <code>/healthz</code> — this only reads its status.
      </p>
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <Field label="Monitor ID">
          <Input value={monitorId} onChange={(e) => setMonitorId(e.target.value)} placeholder="8123456" />
        </Field>
        <Field label="Read-only API key" help={uptimeRobot.apiKeyMasked ? `Currently set: ${uptimeRobot.apiKeyMasked}` : 'Not set'}>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Leave blank to keep existing" />
        </Field>
        <div className="row-3">
          <Btn size="sm" loading={busy} onClick={() => onSave(apiKey, monitorId)}>
            Save
          </Btn>
          <Btn size="sm" variant="secondary" loading={busy} onClick={onTest}>
            Test connection
          </Btn>
        </div>
      </div>
    </>
  );
}

export default function IntegrationsHub() {
  const { tiles, sentry, email, slack, uptimeRobot } = useLoaderData<typeof loader>();
  const ops = useIntentSubmit();
  const testSentry = () => ops.submit({ intent: 'testSentry' });
  const saveEmail = (fields: Record<string, string>) => ops.submit({ intent: 'saveEmail', ...fields });
  const testEmail = (to: string) => ops.submit({ intent: 'testEmail', to });
  const saveSlackWebhook = (webhookUrl: string) => ops.submit({ intent: 'saveSlackWebhook', webhookUrl });
  const testSlackWebhook = () => ops.submit({ intent: 'testSlackWebhook' });
  const saveAlertThresholds = (thresholdCount: string, thresholdWindowMin: string) =>
    ops.submit({ intent: 'saveAlertThresholds', thresholdCount, thresholdWindowMin });
  const saveUptimeRobot = (apiKey: string, monitorId: string) => ops.submit({ intent: 'saveUptimeRobot', apiKey, monitorId });
  const testUptimeRobot = () => ops.submit({ intent: 'testUptimeRobot' });

  return (
    <div className="page">
      <PageHead
        title="Integrations"
        sub="Every external service this app talks to — AI providers and ops tooling — as a marketplace-style tile, with masked credentials and a real test-connection check."
      />
      {CATEGORIES.map((cat) => {
        const inCategory = tiles.filter((t) => t.category === cat);
        return (
          <Card key={cat} style={{ marginBottom: 16 }}>
            <CardHead title={CATEGORY_LABEL[cat]} />
            <div className="card-pad">
              {inCategory.length === 0 ? (
                <EmptyState icon="connect" title="No tiles yet">
                  This category has no wired integrations yet.
                </EmptyState>
              ) : (
                <div className="grid grid-2">
                  {inCategory.map((tile) => (
                    <div key={tile.id} className="card card-pad">
                      <div className="row spread" style={{ marginBottom: 10 }}>
                        <div className="row-3">
                          <span className="tile-ico" style={{ background: 'var(--p-surface-secondary)' }}>
                            <IntegrationIcon slug={tile.simpleIconSlug} size={19} />
                          </span>
                          <span className="t-strong">{tile.label}</span>
                        </div>
                        <Badge tone="info">{tile.configKind === 'DB' ? 'Configured here' : 'Env + test'}</Badge>
                      </div>
                      <p className="t-xs t-muted" style={{ marginBottom: 10 }}>{tile.description}</p>
                      {tile.id === 'sentry' ? (
                        <SentryTileBody configured={sentry.configured} lastTestedAt={sentry.lastTestedAt} onTest={testSentry} busy={ops.busy} />
                      ) : null}
                      {tile.id === 'email' ? (
                        <EmailTileBody email={email} onSave={saveEmail} onTest={testEmail} busy={ops.busy} />
                      ) : null}
                      {tile.id === 'slack-ops' ? (
                        <SlackTileBody
                          slack={slack}
                          onSaveWebhook={saveSlackWebhook}
                          onTest={testSlackWebhook}
                          onSaveThresholds={saveAlertThresholds}
                          busy={ops.busy}
                        />
                      ) : null}
                      {tile.id === 'uptimerobot' ? (
                        <UptimeRobotTileBody uptimeRobot={uptimeRobot} onSave={saveUptimeRobot} onTest={testUptimeRobot} busy={ops.busy} />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

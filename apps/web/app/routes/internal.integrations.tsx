import { json } from '@remix-run/node';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { captureMessage } from '~/services/observability/sentry.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { encryptJson, decryptJson } from '~/services/security/crypto.server';
import { sendEmail, resolveMailerStatus } from '~/services/notifications/mailer.server';
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
    },
  });
  const mailerStatus = await resolveMailerStatus();
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

export default function IntegrationsHub() {
  const { tiles, sentry, email } = useLoaderData<typeof loader>();
  const ops = useIntentSubmit();
  const testSentry = () => ops.submit({ intent: 'testSentry' });
  const saveEmail = (fields: Record<string, string>) => ops.submit({ intent: 'saveEmail', ...fields });
  const testEmail = (to: string) => ops.submit({ intent: 'testEmail', to });

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

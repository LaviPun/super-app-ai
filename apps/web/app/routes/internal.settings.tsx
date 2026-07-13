import { json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { SettingsService } from '~/services/settings/settings.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  useAdminCtx,
  Btn,
  Icon,
  Field,
  Input,
  Toggle,
  Banner,
  Badge,
  Avatar,
  Card,
  CardHead,
  PageHead,
} from '~/components/admin/page-kit';

function getEnvKeyStatus() {
  const openai = process.env.OPENAI_API_KEY?.trim();
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  return {
    openaiEnvConfigured: !!openai,
    openaiEnvMasked: openai ? '••••••••' + openai.slice(-4) : '',
    claudeEnvConfigured: !!anthropic,
    claudeEnvMasked: anthropic ? '••••••••' + anthropic.slice(-4) : '',
  };
}

/** Real (non-secret) env reference for the Environment tab; secrets are reported set/unset only. */
function getEnvReference() {
  const val = (v?: string) => {
    const t = v?.trim();
    return t ? t : null;
  };
  return {
    scopes: val(process.env.SCOPES),
    adminPasswordSet: !!val(process.env.INTERNAL_ADMIN_PASSWORD),
    encryptionKeySet: !!val(process.env.ENCRYPTION_KEY),
    aiRouterUrl: val(process.env.INTERNAL_AI_ROUTER_URL),
    ollamaBaseUrl: val(process.env.ROUTER_OLLAMA_BASE_URL),
    aiToolAuditRetentionDays: val(process.env.INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS),
    ssoConfigured: !!(
      val(process.env.INTERNAL_SSO_ISSUER) &&
      val(process.env.INTERNAL_SSO_CLIENT_ID) &&
      val(process.env.INTERNAL_SSO_CLIENT_SECRET) &&
      val(process.env.INTERNAL_SSO_REDIRECT_URI)
    ),
  };
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const settings = await new SettingsService().get();
  return json({
    settings,
    envKeys: getEnvKeyStatus(),
    envRef: getEnvReference(),
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');
  const service = new SettingsService();
  const activity = new ActivityLogService();

  if (intent === 'appearance') {
    await service.update({
      appName: String(form.get('appName') ?? '').trim() || 'SuperApp AI',
      headerColor: String(form.get('headerColor') ?? '#000000').trim(),
      logoUrl: String(form.get('logoUrl') ?? '').trim() || null,
      faviconUrl: String(form.get('faviconUrl') ?? '').trim() || null,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', details: { section: 'appearance' } });
    return json({ toast: { message: 'Appearance settings saved' }, section: 'appearance' });
  }

  if (intent === 'profile') {
    await service.update({
      adminName: String(form.get('adminName') ?? '').trim() || 'Admin',
      adminEmail: String(form.get('adminEmail') ?? '').trim() || null,
      profilePicUrl: String(form.get('profilePicUrl') ?? '').trim() || null,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', details: { section: 'profile' } });
    return json({ toast: { message: 'Profile settings saved' }, section: 'profile' });
  }

  if (intent === 'contact') {
    await service.update({
      companyName: String(form.get('companyName') ?? '').trim() || null,
      supportEmail: String(form.get('supportEmail') ?? '').trim() || null,
      supportUrl: String(form.get('supportUrl') ?? '').trim() || null,
      privacyUrl: String(form.get('privacyUrl') ?? '').trim() || null,
      termsUrl: String(form.get('termsUrl') ?? '').trim() || null,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', details: { section: 'contact' } });
    return json({ toast: { message: 'Contact information saved' }, section: 'contact' });
  }

  if (intent === 'config') {
    await service.update({
      defaultTimezone: String(form.get('defaultTimezone') ?? 'UTC').trim(),
      dateFormat: String(form.get('dateFormat') ?? 'YYYY-MM-DD').trim(),
      enableEmailAlerts: form.get('enableEmailAlerts') === 'true',
      alertRecipients: String(form.get('alertRecipients') ?? '').trim() || null,
      maintenanceMode: form.get('maintenanceMode') === 'true',
      maintenanceMessage: String(form.get('maintenanceMessage') ?? '').trim() || null,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', details: { section: 'config' } });
    return json({ toast: { message: 'App configuration saved' }, section: 'config' });
  }

  // AI provider/model/pricing writes live solely on /internal/ai-providers now.
  // Settings no longer writes providers — see the AI & API keys tab link card.

  return json({ error: 'Unknown intent' }, { status: 400 });
}

type SettingsActionData = { toast?: { message: string }; section?: string; error?: string };

/** Fetcher whose toast always reflects the server response (error styling on failure). */
function useSettingsFetcher() {
  const fetcher = useFetcher<SettingsActionData>();
  const ctx = useAdminCtx();
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.error) ctx.toast(fetcher.data.error, true);
      else if (fetcher.data.toast?.message) ctx.toast(fetcher.data.toast.message);
    }
  }, [fetcher.state, fetcher.data, ctx]);
  return fetcher;
}

export default function AdminSettings() {
  const { settings, envKeys, envRef } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const [tab, setTab] = useState('appearance');
  const [color, setColor] = useState(settings.headerColor);

  const appearanceFetcher = useSettingsFetcher();
  const profileFetcher = useSettingsFetcher();
  const contactFetcher = useSettingsFetcher();
  const configFetcher = useSettingsFetcher();

  // The Advanced toggles post the full `config` payload so untouched fields
  // (timezone, date format, recipients, maintenance message) are preserved.
  const submitConfig = (overrides: { maintenanceMode?: boolean; enableEmailAlerts?: boolean }) => {
    const fd = new FormData();
    fd.set('intent', 'config');
    fd.set('defaultTimezone', settings.defaultTimezone);
    fd.set('dateFormat', settings.dateFormat);
    fd.set('enableEmailAlerts', String(overrides.enableEmailAlerts ?? settings.enableEmailAlerts));
    fd.set('alertRecipients', settings.alertRecipients ?? '');
    fd.set('maintenanceMode', String(overrides.maintenanceMode ?? settings.maintenanceMode));
    fd.set('maintenanceMessage', settings.maintenanceMessage ?? '');
    configFetcher.submit(fd, { method: 'post' });
  };
  const maintenanceChecked = configFetcher.formData
    ? configFetcher.formData.get('maintenanceMode') === 'true'
    : settings.maintenanceMode;
  const emailAlertsChecked = configFetcher.formData
    ? configFetcher.formData.get('enableEmailAlerts') === 'true'
    : settings.enableEmailAlerts;

  return (
    <div className="page page-narrow">
      <PageHead title="Settings" sub="Internal admin configuration — appearance, profile, security and environment." />
      <div className="settings-layout">
        <nav className="settings-nav">
          {([
            ['appearance', 'Appearance', 'desktop'],
            ['profile', 'Profile', 'user'],
            ['contact', 'Contact & Legal', 'doc'],
            ['keys', 'AI & API keys', 'key'],
            ['security', 'Password & SSO', 'lock'],
            ['env', 'Environment', 'code'],
            ['advanced', 'Advanced', 'settings'],
          ] as Array<[string, string, string]>).map((s) => (
            <button key={s[0]} className={'settings-nav-item' + (tab === s[0] ? ' sel' : '')} onClick={() => setTab(s[0])}>
              <Icon name={s[2]} size={16} />
              {s[1]}
            </button>
          ))}
        </nav>
        <div className="grow">
          {tab === 'appearance' && (
            <Card pad>
              <appearanceFetcher.Form method="post" className="stack-5">
                <input type="hidden" name="intent" value="appearance" />
                <input type="hidden" name="faviconUrl" value={settings.faviconUrl ?? ''} />
                <div className="t-h3">Appearance</div>
                <Field label="App name">
                  <Input name="appName" defaultValue={settings.appName} />
                </Field>
                <Field label="Header / brand color" help="Applied to the admin top bar and nav">
                  <div className="row-2">
                    {['#1F3A5F', '#14213A', '#0E9F6E', '#6B40D8'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="swatch"
                        style={{ width: 30, height: 30, background: c, outline: c === color ? '2px solid var(--sa-secondary)' : 'none', outlineOffset: 2 }}
                        onClick={() => setColor(c)}
                      />
                    ))}
                    <Input mono name="headerColor" value={color} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)} style={{ width: 120 }} />
                  </div>
                </Field>
                <Field label="Logo URL" optional>
                  <Input mono name="logoUrl" placeholder="https://…" defaultValue={settings.logoUrl ?? ''} />
                </Field>
                <div>
                  <Btn variant="primary" type="submit" loading={appearanceFetcher.state !== 'idle'}>
                    Save
                  </Btn>
                </div>
              </appearanceFetcher.Form>
            </Card>
          )}
          {tab === 'profile' && (
            <Card pad>
              <profileFetcher.Form method="post" className="stack-5">
                <input type="hidden" name="intent" value="profile" />
                <div className="t-h3">Profile</div>
                <div className="row-3">
                  <Avatar name={settings.adminName} src={settings.profilePicUrl || undefined} size={56} />
                </div>
                <Field label="Admin name">
                  <Input name="adminName" defaultValue={settings.adminName} />
                </Field>
                <Field label="Email">
                  <Input name="adminEmail" type="email" defaultValue={settings.adminEmail ?? ''} />
                </Field>
                <Field label="Profile picture URL" optional help="URL to a square photo. Leave blank for the initials avatar.">
                  <Input mono name="profilePicUrl" placeholder="https://…" defaultValue={settings.profilePicUrl ?? ''} />
                </Field>
                <div>
                  <Btn variant="primary" type="submit" loading={profileFetcher.state !== 'idle'}>
                    Save
                  </Btn>
                </div>
              </profileFetcher.Form>
            </Card>
          )}
          {tab === 'contact' && (
            <Card pad>
              <contactFetcher.Form method="post" className="stack-5">
                <input type="hidden" name="intent" value="contact" />
                <div className="t-h3">Contact & Legal</div>
                <div className="grid grid-2">
                  <Field label="Company name">
                    <Input name="companyName" defaultValue={settings.companyName ?? ''} />
                  </Field>
                  <Field label="Support email">
                    <Input name="supportEmail" type="email" defaultValue={settings.supportEmail ?? ''} />
                  </Field>
                </div>
                <Field label="Support URL" optional>
                  <Input mono name="supportUrl" placeholder="https://…" defaultValue={settings.supportUrl ?? ''} />
                </Field>
                <div className="grid grid-2">
                  <Field label="Privacy URL">
                    <Input mono name="privacyUrl" defaultValue={settings.privacyUrl ?? ''} />
                  </Field>
                  <Field label="Terms URL">
                    <Input mono name="termsUrl" defaultValue={settings.termsUrl ?? ''} />
                  </Field>
                </div>
                <div>
                  <Btn variant="primary" type="submit" loading={contactFetcher.state !== 'idle'}>
                    Save
                  </Btn>
                </div>
              </contactFetcher.Form>
            </Card>
          )}
          {tab === 'keys' && (
            <Card pad>
              <div className="stack-4">
                <div className="t-h3">AI & API keys</div>
                <Banner tone="info">
                  AI providers, models &amp; pricing are managed in one place — the AI Providers page. Settings no longer edits provider keys.
                </Banner>
                <div className="stack-2">
                  <div className="row spread" style={{ alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--p-border)' }}>
                    <span className="stack" style={{ gap: 1 }}>
                      <span className="t-sm t-strong">Providers, models &amp; pricing</span>
                      <span className="t-xs t-muted">Add or edit AI backends, sync model catalogs, and set per-model pricing.</span>
                    </span>
                    <Btn icon="connect" onClick={() => ctx.go('#/admin/ai-providers')}>
                      AI Providers
                    </Btn>
                  </div>
                  <div className="row spread" style={{ alignItems: 'center', padding: '10px 0' }}>
                    <span className="stack" style={{ gap: 1 }}>
                      <span className="t-sm t-strong">Account &amp; billing</span>
                      <span className="t-xs t-muted">Account details, balances, daily/alert limits and spend.</span>
                    </span>
                    <Btn icon="key" onClick={() => ctx.go('#/admin/ai-providers?tab=accounts')}>
                      Accounts
                    </Btn>
                  </div>
                </div>
                {(envKeys.openaiEnvConfigured || envKeys.claudeEnvConfigured) && (
                  <span className="t-xs t-muted">
                    Environment keys detected. Review them under the Environment tab.
                  </span>
                )}
              </div>
            </Card>
          )}
          {tab === 'security' && (
            <Card pad>
              <div className="stack-5">
                <div className="t-h3">Password & SSO</div>
                <Field
                  label="INTERNAL_ADMIN_PASSWORD"
                  help="Set via .env (or your deployment config) and restart the app — the shared internal admin password cannot be rotated from this page."
                >
                  <Input mono disabled defaultValue={envRef.adminPasswordSet ? '••••••••••••' : '(not set)'} />
                </Field>
                <div className="divider" />
                <div className="row spread">
                  <span className="stack" style={{ gap: 1 }}>
                    <span className="field-label">OIDC SSO</span>
                    <span className="t-xs t-muted">Google OAuth / Okta via INTERNAL_SSO_* env vars</span>
                  </span>
                  <Badge tone={envRef.ssoConfigured ? 'success' : undefined} dot>
                    {envRef.ssoConfigured ? 'Configured' : 'Not configured'}
                  </Badge>
                </div>
              </div>
            </Card>
          )}
          {tab === 'env' && (
            <Card>
              <CardHead title="Environment variables" sub="Reference — values are read from .env at boot" />
              <pre className="code-block" style={{ margin: 16 }}>
                {[
                  `SCOPES=${envRef.scopes ?? '(not set)'}`,
                  `INTERNAL_ADMIN_PASSWORD=${envRef.adminPasswordSet ? '••••••••' : '(not set)'}`,
                  `ENCRYPTION_KEY=${envRef.encryptionKeySet ? '••••••••' : '(not set)'}`,
                  `OPENAI_API_KEY=${envKeys.openaiEnvConfigured ? envKeys.openaiEnvMasked : '(not set)'}`,
                  `ANTHROPIC_API_KEY=${envKeys.claudeEnvConfigured ? envKeys.claudeEnvMasked : '(not set)'}`,
                  `INTERNAL_AI_ROUTER_URL=${envRef.aiRouterUrl ?? '(not set)'}`,
                  `ROUTER_OLLAMA_BASE_URL=${envRef.ollamaBaseUrl ?? '(not set)'}`,
                  `INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS=${envRef.aiToolAuditRetentionDays ?? '(not set)'}`,
                ].join('\n')}
              </pre>
            </Card>
          )}
          {tab === 'advanced' && (
            <Card pad>
              <div className="stack-5">
                <div className="t-h3">Advanced</div>
                <label className="row spread">
                  <span className="stack" style={{ gap: 1 }}>
                    <span className="field-label">Maintenance mode</span>
                    <span className="t-xs t-muted">Show a maintenance banner to all merchants</span>
                  </span>
                  <Toggle checked={maintenanceChecked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => submitConfig({ maintenanceMode: e.target.checked })} />
                </label>
                <label className="row spread">
                  <span className="stack" style={{ gap: 1 }}>
                    <span className="field-label">Email alerts</span>
                    <span className="t-xs t-muted">Notify on release-gate trips and DLQ growth</span>
                  </span>
                  <Toggle checked={emailAlertsChecked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => submitConfig({ enableEmailAlerts: e.target.checked })} />
                </label>
                <div className="divider" />
                <Banner tone="warning" title="Store & plan control">
                  Change any store’s plan without Shopify billing from the store detail page.
                </Banner>
                <div className="row spread" style={{ alignItems: 'center', padding: '10px 0' }}>
                  <span className="stack" style={{ gap: 1 }}>
                    <span className="field-label">Metaobject backfill</span>
                    <span className="t-xs t-muted">One-shot maintenance tool to backfill module metaobjects for a store.</span>
                  </span>
                  <Btn icon="database" onClick={() => ctx.go('#/admin/metaobject-backfill')}>
                    Open tool
                  </Btn>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

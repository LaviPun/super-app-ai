import { json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { SettingsService } from '~/services/settings/settings.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { decryptJson } from '~/services/security/crypto.server';
import {
  useAdminCtx,
  Btn,
  Icon,
  Field,
  Input,
  Select,
  Checkbox,
  Toggle,
  Banner,
  Badge,
  Avatar,
  Card,
  CardHead,
  PageHead,
  EmptyState,
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

/** Masked display of a provider's real (encrypted-at-rest) API key. */
function maskProviderKey(apiKeyEnc: string): string {
  try {
    const { apiKey } = decryptJson<{ apiKey: string }>(apiKeyEnc);
    if (!apiKey || apiKey.length < 4) return '••••';
    return '••••••••' + apiKey.slice(-4);
  } catch {
    return '—';
  }
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const aiProviderService = new AiProviderService();
  const [settings, defaultProviders, allProviders, activeProvider] = await Promise.all([
    new SettingsService().get(),
    aiProviderService.getDefaultProvidersForSettings(),
    aiProviderService.list(),
    aiProviderService.getActive(),
  ]);
  return json({
    settings,
    defaultProviders,
    allProviders: allProviders.map((p) => ({
      id: p.id,
      name: p.name,
      provider: p.provider,
      isActive: p.isActive,
      apiKeyMasked: maskProviderKey(p.apiKeyEnc),
    })),
    activeProviderId: activeProvider?.id ?? null,
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

  const aiProviderService = new AiProviderService();

  if (intent === 'saveOpenAI') {
    const apiKey = String(form.get('openaiApiKey') ?? '').trim();
    const model = String(form.get('openaiModel') ?? '').trim();
    try {
      await aiProviderService.upsertDefaultOpenAI({ apiKey: apiKey || undefined, model: model || undefined });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'OpenAI save failed.' }, { status: 400 });
    }
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPENAI_PROVIDER_UPDATED' });
    return json({ toast: { message: 'OpenAI settings saved' }, section: 'ai' });
  }

  if (intent === 'saveClaude') {
    const apiKey = String(form.get('claudeApiKey') ?? '').trim();
    const model = String(form.get('claudeModel') ?? '').trim();
    const skillsRaw = String(form.get('claudeSkills') ?? '').trim();
    const codeExecution = form.get('claudeCodeExecution') === 'true';
    const skills = skillsRaw ? skillsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : undefined;
    const extraConfig = skills?.length || codeExecution ? { skills, codeExecution } : undefined;
    try {
      await aiProviderService.upsertDefaultClaude({ apiKey: apiKey || undefined, model: model || undefined, extraConfig });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Claude save failed.' }, { status: 400 });
    }
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'CLAUDE_PROVIDER_UPDATED' });
    return json({ toast: { message: 'Claude settings saved' }, section: 'ai' });
  }

  if (intent === 'saveDefaultAi') {
    const value = String(form.get('defaultAiProvider') ?? '').trim();
    const allowed = value === 'openai' || value === 'claude' ? value : null;
    await service.update({ defaultAiProvider: allowed });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'DEFAULT_AI_PROVIDER_UPDATED', details: { defaultAiProvider: allowed } });
    return json({ toast: { message: 'Default AI provider saved' }, section: 'ai' });
  }

  if (intent === 'setMainApi') {
    const providerId = String(form.get('mainApiProviderId') ?? '').trim();
    if (!providerId) return json({ error: 'Please select a provider.' }, { status: 400 });
    const aiProviderService = new AiProviderService();
    await aiProviderService.setActive(providerId);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'MAIN_API_PROVIDER_SET', resource: `provider:${providerId}` });
    return json({ toast: { message: 'Main API updated' }, section: 'ai' });
  }

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
  const { settings, defaultProviders, allProviders, activeProviderId, envKeys, envRef } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const [tab, setTab] = useState('appearance');
  const [color, setColor] = useState(settings.headerColor);

  const appearanceFetcher = useSettingsFetcher();
  const profileFetcher = useSettingsFetcher();
  const contactFetcher = useSettingsFetcher();
  const configFetcher = useSettingsFetcher();
  const openaiFetcher = useSettingsFetcher();
  const claudeFetcher = useSettingsFetcher();
  const defaultAiFetcher = useSettingsFetcher();
  const mainApiFetcher = useSettingsFetcher();

  const [mainApiProviderId, setMainApiProviderId] = useState(activeProviderId ?? '');
  useEffect(() => {
    setMainApiProviderId(activeProviderId ?? '');
  }, [activeProviderId]);

  const [defaultAi, setDefaultAi] = useState<'openai' | 'claude' | null>(settings.defaultAiProvider);
  useEffect(() => {
    setDefaultAi(settings.defaultAiProvider);
  }, [settings.defaultAiProvider]);

  const claudeExtra = (() => {
    if (!defaultProviders.claude?.extraConfig) return { skills: '', codeExecution: false };
    try {
      const c = JSON.parse(defaultProviders.claude.extraConfig) as { skills?: string[]; codeExecution?: boolean };
      return { skills: c.skills?.join(', ') ?? '', codeExecution: !!c.codeExecution };
    } catch {
      return { skills: '', codeExecution: false };
    }
  })();
  const [claudeCodeExecution, setClaudeCodeExecution] = useState(claudeExtra.codeExecution);

  const mainApiOptions = allProviders.map((p) => ({
    label:
      p.provider === 'OPENAI'
        ? 'OpenAI'
        : p.provider === 'ANTHROPIC'
          ? 'Claude (Anthropic)'
          : p.name.replace(/\s*\(default\)\s*$/i, '').trim() || p.provider,
    value: p.id,
  }));

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
                <Banner tone="info" action={<Btn size="sm" onClick={() => ctx.go('#/admin/ai-providers')}>Manage AI providers</Btn>}>
                  Provider keys (OpenAI, Claude) live under AI Providers. Internal flows always default to self-hosted Qwen3.
                </Banner>
                {allProviders.length > 0 ? (
                  <div className="stack-2">
                    {allProviders.map((p) => (
                      <div key={p.id} className="row spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--p-border)' }}>
                        <span className="row-2">
                          <span className="t-sm t-strong">{p.name}</span>
                          {p.id === activeProviderId && (
                            <Badge tone="success" dot>
                              Main API
                            </Badge>
                          )}
                        </span>
                        <span className="t-mono t-xs">{p.apiKeyMasked}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon="key" title="No providers configured yet">
                    Save an OpenAI or Claude key below, or add providers under AI Providers.
                  </EmptyState>
                )}
                {allProviders.length > 0 && (
                  <mainApiFetcher.Form method="post">
                    <input type="hidden" name="intent" value="setMainApi" />
                    <Field label="Main API" help="Only the selected provider is used by default.">
                      <div className="row-2">
                        <Select
                          name="mainApiProviderId"
                          value={mainApiProviderId}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMainApiProviderId(e.target.value)}
                          options={[{ label: 'Select one…', value: '' }, ...mainApiOptions]}
                        />
                        <Btn variant="primary" type="submit" disabled={!mainApiProviderId} loading={mainApiFetcher.state !== 'idle'}>
                          Set as main API
                        </Btn>
                      </div>
                    </Field>
                  </mainApiFetcher.Form>
                )}
                {allProviders.length === 0 && (envKeys.openaiEnvConfigured || envKeys.claudeEnvConfigured) && (
                  <defaultAiFetcher.Form method="post" className="stack-2">
                    <input type="hidden" name="intent" value="saveDefaultAi" />
                    <input type="hidden" name="defaultAiProvider" value={defaultAi ?? ''} />
                    <Field label="Default provider (.env keys)" help="When using .env keys only, choose which provider is preferred.">
                      <div className="stack-2">
                        <Checkbox
                          label="Use OpenAI as default"
                          checked={defaultAi === 'openai'}
                          onChange={() => setDefaultAi((prev) => (prev === 'openai' ? null : 'openai'))}
                        />
                        <Checkbox
                          label="Use Claude as default"
                          checked={defaultAi === 'claude'}
                          onChange={() => setDefaultAi((prev) => (prev === 'claude' ? null : 'claude'))}
                        />
                      </div>
                    </Field>
                    <div>
                      <Btn type="submit" loading={defaultAiFetcher.state !== 'idle'}>
                        Save
                      </Btn>
                    </div>
                  </defaultAiFetcher.Form>
                )}
                <div className="divider" />
                <openaiFetcher.Form method="post" className="stack-4">
                  <input type="hidden" name="intent" value="saveOpenAI" />
                  <div className="t-h3">OpenAI</div>
                  <Field
                    label="API key"
                    help={
                      defaultProviders.openai
                        ? `In database: ${defaultProviders.openai.apiKeyMasked}`
                        : envKeys.openaiEnvConfigured
                          ? `From .env: ${envKeys.openaiEnvMasked}`
                          : undefined
                    }
                  >
                    <Input mono type="password" name="openaiApiKey" placeholder="Leave blank to keep existing" autoComplete="off" />
                  </Field>
                  <Field label="Default model" optional>
                    <Input mono name="openaiModel" defaultValue={defaultProviders.openai?.model ?? ''} placeholder="gpt-4o-mini" />
                  </Field>
                  <div>
                    <Btn variant="primary" type="submit" loading={openaiFetcher.state !== 'idle'}>
                      Save OpenAI
                    </Btn>
                  </div>
                </openaiFetcher.Form>
                <div className="divider" />
                <claudeFetcher.Form method="post" className="stack-4">
                  <input type="hidden" name="intent" value="saveClaude" />
                  <input type="hidden" name="claudeCodeExecution" value={claudeCodeExecution ? 'true' : 'false'} />
                  <div className="t-h3">Claude (Anthropic)</div>
                  <Field
                    label="API key"
                    help={
                      defaultProviders.claude
                        ? `In database: ${defaultProviders.claude.apiKeyMasked}`
                        : envKeys.claudeEnvConfigured
                          ? `From .env: ${envKeys.claudeEnvMasked}`
                          : undefined
                    }
                  >
                    <Input mono type="password" name="claudeApiKey" placeholder="Leave blank to keep existing" autoComplete="off" />
                  </Field>
                  <Field label="Default model" optional>
                    <Input mono name="claudeModel" defaultValue={defaultProviders.claude?.model ?? ''} placeholder="claude-sonnet-4-20250514" />
                  </Field>
                  <Field label="Agent Skills" optional help="Comma-separated, e.g. pptx, xlsx, docx">
                    <Input mono name="claudeSkills" defaultValue={claudeExtra.skills} placeholder="pptx, xlsx, docx" />
                  </Field>
                  <Checkbox label="Enable code execution" checked={claudeCodeExecution} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaudeCodeExecution(e.target.checked)} />
                  <div>
                    <Btn variant="primary" type="submit" loading={claudeFetcher.state !== 'idle'}>
                      Save Claude
                    </Btn>
                  </div>
                </claudeFetcher.Form>
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
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

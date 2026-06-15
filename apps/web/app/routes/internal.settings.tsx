import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { SettingsService } from '~/services/settings/settings.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import {
  useAdminCtx,
  Btn,
  Icon,
  Field,
  Input,
  Checkbox,
  Toggle,
  Banner,
  Avatar,
  Card,
  CardHead,
  PageHead,
  PROVIDERS,
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

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const settings = await new SettingsService().get();
  const aiProviderService = new AiProviderService();
  const defaultProviders = await aiProviderService.getDefaultProvidersForSettings();
  const allProviders = await aiProviderService.list();
  const activeProvider = await aiProviderService.getActive();
  const envKeys = getEnvKeyStatus();
  return json({
    settings,
    defaultProviders,
    allProviders: allProviders.map((p) => ({ id: p.id, name: p.name, provider: p.provider, isActive: p.isActive })),
    activeProviderId: activeProvider?.id ?? null,
    envKeys,
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

  if (intent === 'saveModuleEngine') {
    const value = form.get('moduleSystemVersion') === 'v2' ? 'v2' : 'v1';
    await service.update({ moduleSystemVersion: value });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', details: { section: 'moduleSystemVersion', moduleSystemVersion: value } });
    return json({ toast: { message: `Module System set to ${value}` }, section: 'config' });
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

export default function AdminSettings() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const [tab, setTab] = useState('appearance');
  const [color, setColor] = useState((data.settings as any)?.headerColor || '#1F3A5F');

  const adminName = (data.settings as any)?.adminName ?? 'Lavi Admin';
  const appName = (data.settings as any)?.appName ?? 'SuperApp AI';
  const providerRows: any[] = data.allProviders.length ? data.allProviders.map((p: any) => ({ ...p, key: '••••••••••' + String(p.id).slice(-4) })) : PROVIDERS;

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
              <div className="stack-5">
                <div className="t-h3">Appearance</div>
                <Field label="App name">
                  <Input defaultValue={appName} />
                </Field>
                <Field label="Header / brand color" help="Applied to the admin top bar and nav">
                  <div className="row-2">
                    {['#1F3A5F', '#14213A', '#0E9F6E', '#6B40D8'].map((c) => (
                      <button
                        key={c}
                        className="swatch"
                        style={{ width: 30, height: 30, background: c, outline: c === color ? '2px solid var(--sa-secondary)' : 'none', outlineOffset: 2 }}
                        onClick={() => setColor(c)}
                      />
                    ))}
                    <Input mono value={color} onChange={(e: any) => setColor(e.target.value)} style={{ width: 120 }} />
                  </div>
                </Field>
                <Field label="Logo URL" optional>
                  <Input mono placeholder="https://…" />
                </Field>
                <div>
                  <Btn variant="primary" onClick={() => ctx.toast('Appearance saved')}>
                    Save
                  </Btn>
                </div>
              </div>
            </Card>
          )}
          {tab === 'profile' && (
            <Card pad>
              <div className="stack-5">
                <div className="t-h3">Profile</div>
                <div className="row-3">
                  <Avatar name={adminName} size={56} />
                  <Btn icon="upload">Upload photo</Btn>
                </div>
                <Field label="Admin name">
                  <Input defaultValue={adminName} />
                </Field>
                <Field label="Email">
                  <Input defaultValue="lavi@superapp.ai" />
                </Field>
                <div>
                  <Btn variant="primary" onClick={() => ctx.toast('Profile saved')}>
                    Save
                  </Btn>
                </div>
              </div>
            </Card>
          )}
          {tab === 'contact' && (
            <Card pad>
              <div className="stack-5">
                <div className="t-h3">Contact & Legal</div>
                <div className="grid grid-2">
                  <Field label="Company name">
                    <Input defaultValue="SuperApp AI Inc." />
                  </Field>
                  <Field label="Support email">
                    <Input defaultValue="support@superapp.ai" />
                  </Field>
                </div>
                <div className="grid grid-2">
                  <Field label="Privacy URL">
                    <Input mono defaultValue="https://superapp.ai/privacy" />
                  </Field>
                  <Field label="Terms URL">
                    <Input mono defaultValue="https://superapp.ai/terms" />
                  </Field>
                </div>
                <div>
                  <Btn variant="primary" onClick={() => ctx.toast('Saved')}>
                    Save
                  </Btn>
                </div>
              </div>
            </Card>
          )}
          {tab === 'keys' && (
            <Card pad>
              <div className="stack-4">
                <div className="t-h3">AI & API keys</div>
                <Banner tone="info" action={<Btn size="sm" onClick={() => ctx.go('#/admin/ai-providers')}>Manage AI providers</Btn>}>
                  Provider keys (OpenAI, Claude) live under AI Providers. Internal flows always default to self-hosted Qwen3.
                </Banner>
                <div className="stack-2">
                  {providerRows.map((p: any) => (
                    <div key={p.id} className="row spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--p-border)' }}>
                      <span className="t-sm t-strong">{p.name}</span>
                      <span className="t-mono t-xs">{p.key}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
          {tab === 'security' && (
            <Card pad>
              <div className="stack-5">
                <div className="t-h3">Password & SSO</div>
                <Field label="INTERNAL_ADMIN_PASSWORD" help="Rotate the shared internal admin password">
                  <Input type="password" placeholder="••••••••••••" />
                </Field>
                <div className="divider" />
                <Checkbox defaultChecked label="Enable OIDC SSO" sub="Google OAuth / Okta via INTERNAL_SSO_* env vars" />
                <div>
                  <Btn variant="primary" onClick={() => ctx.toast('Security updated')}>
                    Save
                  </Btn>
                </div>
              </div>
            </Card>
          )}
          {tab === 'env' && (
            <Card>
              <CardHead title="Environment variables" sub="Reference — values are read from .env at boot" />
              <pre className="code-block" style={{ margin: 16 }}>
                {'SCOPES=read_products,write_products,read_orders\nINTERNAL_ADMIN_PASSWORD=••••••••\nENCRYPTION_KEY=••••••••\nINTERNAL_AI_ROUTER_URL=https://…modal.run\nROUTER_OLLAMA_BASE_URL=http://127.0.0.1:11434\nINTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS=90'}
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
                  <Toggle onChange={(e: any) => ctx.toast('Maintenance mode ' + (e.target.checked ? 'on' : 'off'))} />
                </label>
                <label className="row spread">
                  <span className="stack" style={{ gap: 1 }}>
                    <span className="field-label">Email alerts</span>
                    <span className="t-xs t-muted">Notify on release-gate trips and DLQ growth</span>
                  </span>
                  <Toggle defaultChecked onChange={(e: any) => ctx.toast('Email alerts ' + (e.target.checked ? 'on' : 'off'))} />
                </label>
                <div className="divider" />
                <Banner tone="warning" title="Store & plan control">
                  Change any store’s plan without Shopify billing from the store detail page.
                </Banner>
                <div className="divider" />
                <div className="t-h3" style={{ color: 'var(--p-critical-text)' }}>
                  Danger zone
                </div>
                <div className="row spread" style={{ padding: '6px 0' }}>
                  <span className="stack" style={{ gap: 1 }}>
                    <span className="field-label">Reset demo data</span>
                    <span className="t-xs t-muted">Discard every change you have made and restore the seed dataset.</span>
                  </span>
                  <Btn className="btn-critical" icon="refresh" onClick={() => ctx.toast('Demo data reset')}>
                    Reset demo data
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

import { json, redirect } from '@remix-run/node';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { AiProviderService, type ProviderKind } from '~/services/internal/ai-provider.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { getPrisma } from '~/db.server';
import { syncProviderCatalogToDb, getLatestProviderFeaturePreset } from '~/services/ai/provider-model-catalog.server';
import {
  useAdminCtx,
  Icon,
  Btn,
  Badge,
  StatusBadge,
  Card,
  CardHead,
  Field,
  Input,
  Select,
  Toggle,
  Checkbox,
  Tabs,
  Modal,
  ConfirmDialog,
  KV,
  DataTable,
  PageHead,
  StatTile,
  MonoChip,
  fmtCents,
  fmtNum,
  PROVIDERS,
  AI_ACCOUNTS,
  MODEL_PRICES,
} from '~/components/admin/page-kit';

type ModelCatalogMeta = {
  model: string;
  displayName?: string;
  description?: string | null;
  contextWindow?: number | null;
};

type ProviderRating = {
  overall: number;
  reliability: number;
  quality: number;
  value: number;
  successRatePct: number;
  totalRequests: number;
  label: 'Recommended' | 'Good' | 'Watch' | 'Needs attention';
};

function parseModelCatalog(extraConfig: string | null): ModelCatalogMeta[] {
  if (!extraConfig) return [];
  try {
    const parsed = JSON.parse(extraConfig) as { modelCatalog?: ModelCatalogMeta[] };
    return Array.isArray(parsed.modelCatalog) ? parsed.modelCatalog : [];
  } catch {
    return [];
  }
}

function extractModelFromUsageMeta(meta: string | null): string | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { model?: unknown };
    return typeof parsed.model === 'string' ? parsed.model : null;
  } catch {
    return null;
  }
}

function parseUsageMeta(meta: string | null): Record<string, unknown> {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function parseOpenAiExtraConfig(extraConfig: string | null): {
  reasoningEffort?: 'low' | 'medium' | 'high';
  verbosity?: 'low' | 'medium' | 'high';
  webSearch?: boolean;
} {
  if (!extraConfig) return {};
  try {
    const parsed = JSON.parse(extraConfig) as {
      openaiFeatures?: {
        reasoningEffort?: 'low' | 'medium' | 'high';
        verbosity?: 'low' | 'medium' | 'high';
        webSearch?: boolean;
      };
    };
    return parsed.openaiFeatures ?? {};
  } catch {
    return {};
  }
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const service = new AiProviderService();
  const providersRaw = await service.list();
  const providerCatalogById = new Map<string, Map<string, ModelCatalogMeta>>();
  for (const p of providersRaw) {
    const map = new Map<string, ModelCatalogMeta>();
    for (const meta of parseModelCatalog(p.extraConfig)) {
      if (meta.model) map.set(meta.model, meta);
    }
    providerCatalogById.set(p.id, map);
  }

  const providers = await Promise.all(
    providersRaw.map(async (p) => ({
      ...p,
      apiKeyMasked: await service.getApiKeyMasked(p.id),
    }))
  );
  const defaultProviders = await service.getDefaultProvidersForSettings();
  const prisma = getPrisma();
  const prices = await prisma.aiModelPrice.findMany({
    where: { isActive: true },
    include: { provider: true },
    orderBy: [{ providerId: 'asc' }, { model: 'asc' }],
    take: 2000,
  });

  const usageRows = await prisma.aiUsage.findMany({
    where: {
      providerId: { in: providersRaw.map((p) => p.id) },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    },
    select: {
      providerId: true,
      action: true,
      tokensIn: true,
      tokensOut: true,
      costCents: true,
      requestCount: true,
      meta: true,
    },
    take: 10000,
    orderBy: { createdAt: 'desc' },
  });

  const usageByProviderModel = new Map<string, { requests: number; tokensIn: number; tokensOut: number; costCents: number }>();
  const providerRatingSeed = new Map<string, {
    totalRequests: number;
    successRequests: number;
    failedRequests: number;
    totalCostCents: number;
    qualitySignals: number;
    qualityAccum: number;
    retryPenaltyAccum: number;
  }>();
  for (const row of usageRows) {
    const seed = providerRatingSeed.get(row.providerId) ?? {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      totalCostCents: 0,
      qualitySignals: 0,
      qualityAccum: 0,
      retryPenaltyAccum: 0,
    };
    const requests = row.requestCount ?? 1;
    const failed = typeof row.action === 'string' && row.action.includes('FAILED');
    seed.totalRequests += requests;
    seed.totalCostCents += row.costCents;
    if (failed) seed.failedRequests += requests;
    else seed.successRequests += requests;

    const meta = parseUsageMeta(row.meta);
    const validOptions = typeof meta.validOptions === 'number' ? meta.validOptions : null;
    const repaired = meta.repaired === true;
    if (validOptions != null) {
      seed.qualitySignals += 1;
      const score = Math.max(0, Math.min(1, validOptions / 3));
      seed.qualityAccum += repaired ? Math.max(0, score - 0.1) : score;
    }
    const attempts = typeof meta.attempts === 'number' ? meta.attempts : 1;
    if (attempts > 1) {
      seed.retryPenaltyAccum += Math.min(0.25, (attempts - 1) * 0.05) * requests;
    }
    providerRatingSeed.set(row.providerId, seed);

    const model = extractModelFromUsageMeta(row.meta);
    if (!model) continue;
    const key = `${row.providerId}:${model}`;
    const current = usageByProviderModel.get(key) ?? { requests: 0, tokensIn: 0, tokensOut: 0, costCents: 0 };
    current.requests += row.requestCount ?? 1;
    current.tokensIn += row.tokensIn;
    current.tokensOut += row.tokensOut;
    current.costCents += row.costCents;
    usageByProviderModel.set(key, current);
  }

  const providerRatings = new Map<string, ProviderRating>();
  for (const p of providersRaw) {
    const seed = providerRatingSeed.get(p.id);
    if (!seed || seed.totalRequests === 0) continue;
    const successRate = seed.successRequests / seed.totalRequests;
    const reliabilityRaw = Math.max(0, Math.min(1, successRate - seed.retryPenaltyAccum / seed.totalRequests));
    const qualityRaw = seed.qualitySignals > 0 ? seed.qualityAccum / seed.qualitySignals : successRate;
    const avgCostPerReq = seed.totalCostCents / seed.totalRequests;
    const valueRaw = avgCostPerReq === 0 ? 1 : Math.max(0, Math.min(1, 1 / (1 + avgCostPerReq / 50)));
    const overall = Math.round((reliabilityRaw * 0.5 + qualityRaw * 0.35 + valueRaw * 0.15) * 100);
    const label: ProviderRating['label'] =
      overall >= 85 ? 'Recommended' :
      overall >= 70 ? 'Good' :
      overall >= 55 ? 'Watch' :
      'Needs attention';
    providerRatings.set(p.id, {
      overall,
      reliability: Math.round(reliabilityRaw * 100),
      quality: Math.round(qualityRaw * 100),
      value: Math.round(valueRaw * 100),
      successRatePct: Math.round(successRate * 100),
      totalRequests: seed.totalRequests,
      label,
    });
  }

  const suggestedProvider = [...providerRatings.entries()]
    .sort((a, b) => b[1].overall - a[1].overall)[0];
  const suggestedProviderId = suggestedProvider?.[0] ?? null;

  const pricesWithMeta = prices.map((pr) => {
    const catalog = providerCatalogById.get(pr.providerId);
    const meta = catalog?.get(pr.model);
    const usage = usageByProviderModel.get(`${pr.providerId}:${pr.model}`) ?? null;
    return {
      ...pr,
      displayName: meta?.displayName ?? pr.model,
      description: meta?.description ?? null,
      contextWindow: meta?.contextWindow ?? null,
      usage30d: usage,
    };
  });

  const appSettings = await prisma.appSettings.findUnique({
    where: { id: 'singleton' },
    select: { fallbackAiProviderId: true },
  });
  const openaiEnv = process.env.OPENAI_API_KEY?.trim();
  const claudeEnv = process.env.ANTHROPIC_API_KEY?.trim();
  const geminiEnv = process.env.GEMINI_API_KEY?.trim();

  return json({
    providers,
    prices: pricesWithMeta,
    defaultProviders,
    providerRatings: Object.fromEntries(providerRatings),
    suggestedProviderId,
    fallbackProviderId: appSettings?.fallbackAiProviderId ?? null,
    envKeyStatus: {
      openai: openaiEnv ? `••••••••${openaiEnv.slice(-4)}` : null,
      claude: claudeEnv ? `••••••••${claudeEnv.slice(-4)}` : null,
      gemini: geminiEnv ? `••••••••${geminiEnv.slice(-4)}` : null,
    },
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');
  const service = new AiProviderService();
  const prisma = getPrisma();
  const activity = new ActivityLogService();

  if (intent === 'saveFallbackProvider') {
    const raw = String(form.get('fallbackProviderId') ?? '').trim();
    const fallbackAiProviderId = raw || null;
    if (fallbackAiProviderId) {
      const exists = await prisma.aiProvider.findUnique({ where: { id: fallbackAiProviderId } });
      if (!exists) return json({ error: 'Fallback provider not found' }, { status: 404 });
    }
    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', fallbackAiProviderId },
      update: { fallbackAiProviderId },
    });
    return json({ ok: true });
  }

  if (intent === 'activate') {
    const id = String(form.get('id') ?? '');
    if (!id) return json({ error: 'Missing id' }, { status: 400 });
    await service.setActive(id);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_ACTIVATED', resource: `provider:${id}` });
    return redirect('/internal/ai-providers');
  }

  if (intent === 'syncCatalog') {
    const providerId = String(form.get('providerId') ?? '');
    if (!providerId) return json({ error: 'Missing provider id' }, { status: 400 });
    const provider = await prisma.aiProvider.findUnique({ where: { id: providerId } });
    if (!provider) return json({ error: 'Provider not found' }, { status: 404 });
    try {
      const result = await syncProviderCatalogToDb({ providerId, providerKind: provider.provider });
      await activity.log({
        actor: 'INTERNAL_ADMIN',
        action: 'PROVIDER_MODEL_CATALOG_SYNCED',
        resource: `provider:${providerId}`,
        details: { syncedCount: result.syncedCount, provider: provider.provider },
      });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Model catalog sync failed.' }, { status: 400 });
    }
    return redirect('/internal/ai-providers');
  }

  if (intent === 'syncProviderUpdates') {
    const providerId = String(form.get('providerId') ?? '');
    if (!providerId) return json({ error: 'Missing provider id' }, { status: 400 });
    const provider = await prisma.aiProvider.findUnique({ where: { id: providerId } });
    if (!provider) return json({ error: 'Provider not found' }, { status: 404 });
    try {
      const result = await syncProviderCatalogToDb({ providerId, providerKind: provider.provider });
      await service.updateExtraConfig(providerId, getLatestProviderFeaturePreset(provider.provider));
      await activity.log({
        actor: 'INTERNAL_ADMIN',
        action: 'PROVIDER_UPDATES_SYNCED',
        resource: `provider:${providerId}`,
        details: { syncedCount: result.syncedCount, provider: provider.provider },
      });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Provider updates sync failed.' }, { status: 400 });
    }
    return redirect('/internal/ai-providers');
  }

  if (intent === 'syncAllProviders') {
    const syncable = await prisma.aiProvider.findMany({
      where: { provider: { in: ['OPENAI', 'ANTHROPIC'] } },
      select: { id: true, provider: true },
    });
    try {
      for (const p of syncable) {
        await syncProviderCatalogToDb({ providerId: p.id, providerKind: p.provider });
        await service.updateExtraConfig(p.id, getLatestProviderFeaturePreset(p.provider));
      }
      await activity.log({
        actor: 'INTERNAL_ADMIN',
        action: 'ALL_PROVIDER_UPDATES_SYNCED',
        details: { count: syncable.length },
      });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Sync-all failed.' }, { status: 400 });
    }
    return redirect('/internal/ai-providers');
  }

  if (intent === 'importEnvDefaults') {
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const claudeKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!openaiKey && !claudeKey) {
      return json({ error: 'No OPENAI_API_KEY or ANTHROPIC_API_KEY found in environment.' }, { status: 400 });
    }

    if (openaiKey) {
      const openai = await service.upsertDefaultOpenAI({
        apiKey: openaiKey,
        model: process.env.OPENAI_DEFAULT_MODEL?.trim() || undefined,
      });
      await syncProviderCatalogToDb({ providerId: openai.id, providerKind: openai.provider });
    }
    if (claudeKey) {
      const claude = await service.upsertDefaultClaude({
        apiKey: claudeKey,
        model: process.env.ANTHROPIC_DEFAULT_MODEL?.trim() || undefined,
      });
      await syncProviderCatalogToDb({ providerId: claude.id, providerKind: claude.provider });
    }

    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'ENV_KEYS_IMPORTED_TO_PROVIDER_DB' });
    return redirect('/internal/ai-providers');
  }

  if (intent === 'updateExtraConfig') {
    const id = String(form.get('id') ?? '');
    const providerKind = String(form.get('providerKind') ?? '');
    const skillsRaw = String(form.get('claudeSkills') ?? '').trim();
    const codeExecution = form.get('claudeCodeExecution') === 'true';
    const reasoningEffort = String(form.get('openaiReasoningEffort') ?? '').trim();
    const verbosity = String(form.get('openaiVerbosity') ?? '').trim();
    const webSearch = form.get('openaiWebSearch') === 'true';
    if (!id) return json({ error: 'Missing provider id' }, { status: 400 });
    if (providerKind === 'OPENAI') {
      await service.updateExtraConfig(id, {
        openaiFeatures: {
          reasoningEffort: (reasoningEffort === 'low' || reasoningEffort === 'medium' || reasoningEffort === 'high') ? reasoningEffort : 'medium',
          verbosity: (verbosity === 'low' || verbosity === 'medium' || verbosity === 'high') ? verbosity : 'medium',
          webSearch,
        },
      });
    } else {
      const skills = skillsRaw ? skillsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : [];
      await service.updateExtraConfig(id, {
        anthropicFeatures: { skills: skills.length ? skills : [], codeExecution },
        skills: skills.length ? skills : undefined,
        codeExecution,
      });
    }
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_EXTRA_CONFIG_UPDATED', resource: `provider:${id}` });
    return redirect('/internal/ai-providers');
  }

  if (intent === 'saveOpenAI') {
    const apiKey = String(form.get('openaiApiKey') ?? '').trim();
    const model = String(form.get('openaiModel') ?? '').trim();
    try {
      const provider = await service.upsertDefaultOpenAI({ apiKey: apiKey || undefined, model: model || undefined });
      await syncProviderCatalogToDb({ providerId: provider.id, providerKind: provider.provider });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'OpenAI save failed.' }, { status: 400 });
    }
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPENAI_PROVIDER_UPDATED' });
    return redirect('/internal/ai-providers');
  }

  if (intent === 'saveClaude') {
    const apiKey = String(form.get('claudeApiKey') ?? '').trim();
    const model = String(form.get('claudeModel') ?? '').trim();
    const skillsRaw = String(form.get('claudeSkills') ?? '').trim();
    const codeExecution = form.get('claudeCodeExecution') === 'true';
    const skills = skillsRaw ? skillsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : undefined;
    const extraConfig = skills?.length || codeExecution ? { skills, codeExecution } : undefined;
    try {
      const provider = await service.upsertDefaultClaude({ apiKey: apiKey || undefined, model: model || undefined, extraConfig });
      await syncProviderCatalogToDb({ providerId: provider.id, providerKind: provider.provider });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Claude save failed.' }, { status: 400 });
    }
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'CLAUDE_PROVIDER_UPDATED' });
    return redirect('/internal/ai-providers');
  }

  const name = String(form.get('name') ?? '').trim();
  const providerRaw = String(form.get('provider') ?? 'OPENAI');
  const apiKey = String(form.get('apiKey') ?? '').trim();
  const model = String(form.get('defaultModel') ?? '').trim();
  const baseUrl = String(form.get('baseUrl') ?? '').trim();
  const claudeSkillsRaw = String(form.get('claudeSkills') ?? '').trim();
  const claudeCodeExecution = form.get('claudeCodeExecution') === 'true';

  if (!name || !apiKey) return json({ error: 'Name and API key are required.' }, { status: 400 });

  const ALLOWED_PROVIDERS: readonly ProviderKind[] = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'AZURE_OPENAI', 'CUSTOM'];
  if (!ALLOWED_PROVIDERS.includes(providerRaw as ProviderKind)) {
    return json({ error: `Unknown provider kind: ${providerRaw}` }, { status: 400 });
  }
  const provider = providerRaw as ProviderKind;

  const extraConfig =
    provider === 'ANTHROPIC' && (claudeSkillsRaw || claudeCodeExecution)
      ? {
          skills: claudeSkillsRaw ? claudeSkillsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : undefined,
          codeExecution: claudeCodeExecution,
        }
      : undefined;

  const created = await service.create({
    name,
    provider,
    apiKey,
    model: model || undefined,
    baseUrl: baseUrl || undefined,
    isActive: true,
    extraConfig: extraConfig ?? undefined,
  });
  if (provider === 'OPENAI' || provider === 'ANTHROPIC') {
    await syncProviderCatalogToDb({ providerId: created.id, providerKind: created.provider });
  }

  await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_CREATED', resource: `provider:${name}`, details: { provider } });
  return redirect('/internal/ai-providers');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AdminProviders() {
  const ctx = useAdminCtx();
  const [modal, setModal] = useState<any>(null);
  const [tab, setTab] = useState('providers');
  const [confirm, setConfirm] = useState<any>(null);
  const [priceModal, setPriceModal] = useState<any>(null);
  const [acctModal, setAcctModal] = useState<any>(null);

  const headAction =
    tab === 'accounts' ? (
      <Btn variant="primary" icon="plus" onClick={() => setAcctModal('link')}>
        Link account
      </Btn>
    ) : tab === 'pricing' ? (
      <Btn variant="primary" icon="plus" onClick={() => setPriceModal('new')}>
        Add pricing
      </Btn>
    ) : (
      <Btn variant="primary" icon="plus" onClick={() => setModal('new')}>
        Add provider
      </Btn>
    );

  return (
    <div className="page">
      <PageHead title="AI Providers" sub="AI backends for merchant module generation, the billing accounts behind them, and per-model pricing." actions={headAction} />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Providers" value={PROVIDERS.length} icon="connect" tone="info" />
        <StatTile label="Active" value="OpenAI" sub="gpt-4o · global default" icon="check" tone="success" />
        <StatTile label="Calls (30d)" value={fmtNum(PROVIDERS.reduce((a, p) => a + p.calls30d, 0))} icon="magic" tone="magic" />
        <StatTile label="Spend (30d)" value={fmtCents(PROVIDERS.reduce((a, p) => a + p.costCents, 0))} icon="chart" tone="success" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'providers', label: 'Providers', badge: PROVIDERS.length },
            { id: 'accounts', label: 'Accounts', badge: AI_ACCOUNTS.length },
            { id: 'pricing', label: 'Model pricing', badge: MODEL_PRICES.length },
          ]}
        />
      </Card>
      {tab === 'providers' && (
        <div className="grid grid-2">
          {PROVIDERS.map((p) => (
            <div key={p.id} className={'card card-pad provider-card' + (p.active ? ' active' : '')}>
              <div className="row spread" style={{ marginBottom: 14 }}>
                <div className="row-3">
                  <span className="tile-ico" style={{ background: 'var(--p-surface-secondary)' }}>
                    <Icon name="connect" size={19} />
                  </span>
                  <div className="stack" style={{ gap: 1 }}>
                    <span className="t-strong">{p.name}</span>
                    <span className="t-xs t-muted">{p.provider}</span>
                  </div>
                </div>
                {p.active ? (
                  <Badge tone="success" dot>
                    Active
                  </Badge>
                ) : p.fallback ? (
                  <Badge tone="info">Fallback</Badge>
                ) : null}
              </div>
              <KV
                rows={[
                  ['Model', <MonoChip key="m">{p.model}</MonoChip>],
                  ['Base URL', <span key="u" className="t-mono t-xs t-trunc" style={{ maxWidth: 200, display: 'inline-block' }}>{p.baseUrl}</span>],
                  ['API key', <span key="k" className="t-mono">{p.key}</span>],
                  ['Calls (30d)', fmtNum(p.calls30d)],
                  ['Cost (30d)', fmtCents(p.costCents)],
                ]}
              />
              {p.skills && (
                <div className="row-2" style={{ marginTop: 10 }}>
                  <span className="t-xs t-muted">Skills:</span>
                  {p.skills.map((sk: string) => (
                    <Badge key={sk} tone="magic">
                      {sk}
                    </Badge>
                  ))}
                  {p.codeExec && <Badge tone="warning">Code exec</Badge>}
                </div>
              )}
              <div className="divider" style={{ margin: '14px 0' }} />
              <div className="row-2">
                {!p.active && (
                  <Btn
                    size="sm"
                    icon="check"
                    onClick={() =>
                      setConfirm({
                        title: 'Set active provider',
                        message: 'Make ' + p.name + ' the global default for all merchant module generation? The current active provider becomes idle.',
                        confirmLabel: 'Set active',
                        tone: 'primary',
                        icon: 'check',
                        onConfirm: () => ctx.toast(p.name + ' set as active'),
                      })
                    }
                  >
                    Set active
                  </Btn>
                )}
                <Btn size="sm" icon="edit" onClick={() => setModal(p)}>
                  Edit
                </Btn>
                <Btn size="sm" icon="transfer" className="btn-plain" onClick={() => ctx.go('#/admin/trace/cor_rs8f2')}>
                  Logs
                </Btn>
                <span className="grow" />
                <Btn
                  size="sm"
                  className="btn-plain-critical"
                  icon="trash"
                  onClick={() =>
                    setConfirm({
                      title: 'Delete provider',
                      message: 'Delete ' + p.name + '? Stores using it fall back to the global default. This cannot be undone.',
                      confirmLabel: 'Delete provider',
                      tone: 'critical',
                      icon: 'trash',
                      onConfirm: () => ctx.toast(p.name + ' deleted'),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'accounts' && (
        <div className="grid grid-2">
          {AI_ACCOUNTS.map((a) => (
            <Card key={a.id} pad>
              <div className="row spread" style={{ marginBottom: 12 }}>
                <div className="row-3">
                  <span className="tile-ico" style={{ background: 'var(--p-surface-secondary)' }}>
                    <Icon name="key" size={18} />
                  </span>
                  <div className="stack" style={{ gap: 1 }}>
                    <span className="t-strong">{a.name}</span>
                    <span className="t-xs t-muted">{a.email}</span>
                  </div>
                </div>
                <StatusBadge value={a.status} />
              </div>
              <KV
                rows={[
                  ['Balance / credit', <span key="b" className="t-strong">{a.balance}</span>],
                  ['API keys', a.keys + ' active'],
                  ['Used by', <Badge key="u">{a.provider}</Badge>],
                ]}
              />
              <div className="row-2" style={{ marginTop: 12 }}>
                <Btn size="sm" icon="eye" onClick={() => setAcctModal(a)}>
                  View keys
                </Btn>
                <Btn
                  size="sm"
                  icon="refresh"
                  onClick={() =>
                    setConfirm({
                      title: 'Rotate API keys',
                      message: 'Rotate all ' + a.keys + ' keys for ' + a.name + '? In-flight requests using the old keys will fail until clients refresh.',
                      confirmLabel: 'Rotate keys',
                      tone: 'critical',
                      icon: 'refresh',
                      onConfirm: () => ctx.toast('Keys rotated for ' + a.name),
                    })
                  }
                >
                  Rotate
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === 'pricing' && (
        <Card>
          <CardHead
            title="Model pricing"
            sub="Cents per 1M tokens · used to compute per-call cost"
            actions={
              <Btn size="sm" icon="plus" onClick={() => setPriceModal('new')}>
                Add pricing
              </Btn>
            }
          />
          <DataTable
            rowKey="id"
            columns={[
              { key: 'provider', label: 'Provider' },
              { key: 'model', label: 'Model', render: (r: any) => <MonoChip>{r.model}</MonoChip> },
              { key: 'input', label: 'Input ¢/1M', num: true },
              { key: 'output', label: 'Output ¢/1M', num: true },
              { key: 'cached', label: 'Cached ¢/1M', num: true, render: (r: any) => (r.cached == null ? '—' : r.cached) },
              {
                key: 'act',
                label: '',
                render: (r: any) => (
                  <div className="dt-actions">
                    <Btn size="sm" icon="edit" className="btn-plain" onClick={() => setPriceModal(r)} />
                    <Btn
                      size="sm"
                      icon="trash"
                      className="btn-plain-critical"
                      onClick={() =>
                        setConfirm({
                          title: 'Delete pricing',
                          message: 'Delete pricing for ' + r.model + '? Cost calculations for this model fall back to the provider default.',
                          confirmLabel: 'Delete',
                          tone: 'critical',
                          icon: 'trash',
                          onConfirm: () => ctx.toast('Pricing deleted'),
                        })
                      }
                    />
                  </div>
                ),
              },
            ]}
            rows={MODEL_PRICES}
          />
        </Card>
      )}
      {modal && <ProviderModal provider={modal === 'new' ? null : modal} onClose={() => setModal(null)} />}
      {priceModal && <PricingModal price={priceModal === 'new' ? null : priceModal} onClose={() => setPriceModal(null)} />}
      {acctModal && (acctModal === 'link' ? <AccountModal onClose={() => setAcctModal(null)} /> : <AccountKeysModal account={acctModal} onClose={() => setAcctModal(null)} />)}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function ProviderModal({ provider, onClose }: { provider: any; onClose: () => void }) {
  const ctx = useAdminCtx();
  const [f, setF] = useState<any>(
    provider
      ? { skillsText: provider.skills ? provider.skills.join(', ') : '', ...provider }
      : { name: '', provider: 'OPENAI', model: '', baseUrl: '', skillsText: '', codeExec: false, active: false, fallback: false },
  );
  const set = (k: string, v: any) => setF((o: any) => ({ ...o, [k]: v }));
  const type = f.provider;
  const save = () => {
    onClose();
    ctx.toast(provider ? 'Provider updated' : 'Provider added');
  };
  return (
    <Modal
      title={provider ? 'Edit provider' : 'Add AI provider'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save}>
            {provider ? 'Save changes' : 'Add provider'}
          </Btn>
        </>
      }
    >
      <div className="stack-4">
        <div className="grid grid-2">
          <Field label="Display name">
            <Input value={f.name} onChange={(e: any) => set('name', e.target.value)} placeholder="OpenAI Production" />
          </Field>
          <Field label="Provider type">
            <Select
              options={[
                { value: 'OPENAI', label: 'OpenAI' },
                { value: 'ANTHROPIC', label: 'Anthropic (Claude)' },
                { value: 'AZURE_OPENAI', label: 'Azure OpenAI' },
                { value: 'CUSTOM', label: 'Custom (OpenAI-compatible)' },
              ]}
              value={type}
              onChange={(e: any) => set('provider', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-2">
          <Field label="Default model">
            <Input mono value={f.model} onChange={(e: any) => set('model', e.target.value)} placeholder="gpt-4o" />
          </Field>
          <Field label="Base URL" optional={type === 'OPENAI'}>
            <Input mono value={f.baseUrl} onChange={(e: any) => set('baseUrl', e.target.value)} placeholder="https://api.openai.com/v1" />
          </Field>
        </div>
        <Field label="API key" help="Encrypted at rest. Leave blank to keep the existing key.">
          <Input type="password" placeholder={provider ? '•••••••••• (unchanged)' : 'sk-…'} />
        </Field>
        {type === 'ANTHROPIC' && (
          <Card className="card-subdued" pad>
            <div className="stack-3">
              <div className="t-h3">Claude options</div>
              <Field label="Agent skills" help="Comma-separated: pptx, xlsx, docx, or custom skill IDs">
                <Input value={f.skillsText} onChange={(e: any) => set('skillsText', e.target.value)} placeholder="pptx, xlsx" />
              </Field>
              <label className="checkbox">
                <Toggle checked={!!f.codeExec} onChange={(e: any) => set('codeExec', e.target.checked)} />
                <span className="t-sm">Enable code execution (beta)</span>
              </label>
            </div>
          </Card>
        )}
        <div className="grid grid-2">
          <Checkbox checked={!!f.active} onChange={(e: any) => set('active', e.target.checked)} label="Set as active provider" sub="Global default for module generation" />
          <Checkbox checked={!!f.fallback} onChange={(e: any) => set('fallback', e.target.checked)} label="Use as fallback" sub="Tried if the active provider fails" />
        </div>
      </div>
    </Modal>
  );
}

function PricingModal({ price, onClose }: { price: any; onClose: () => void }) {
  const ctx = useAdminCtx();
  const [f, setF] = useState<any>(price ? { ...price } : { provider: PROVIDERS[0] ? PROVIDERS[0].name : '', model: '', input: '', output: '', cached: '' });
  const set = (k: string, v: any) => setF((o: any) => ({ ...o, [k]: v }));
  const save = () => {
    onClose();
    ctx.toast(price ? 'Pricing updated' : 'Pricing added');
  };
  return (
    <Modal
      title={price ? 'Edit pricing' : 'Add model pricing'}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save}>
            Save pricing
          </Btn>
        </>
      }
    >
      <div className="stack-4">
        <div className="grid grid-2">
          <Field label="Provider">
            <Select options={PROVIDERS.map((p) => p.name)} value={f.provider} onChange={(e: any) => set('provider', e.target.value)} />
          </Field>
          <Field label="Model">
            <Input mono value={f.model} onChange={(e: any) => set('model', e.target.value)} placeholder="gpt-4o" />
          </Field>
        </div>
        <div className="t-h3">
          Price <span className="t-xs t-muted">(cents per 1M tokens)</span>
        </div>
        <div className="grid grid-3">
          <Field label="Input">
            <Input type="number" value={f.input} onChange={(e: any) => set('input', e.target.value)} />
          </Field>
          <Field label="Output">
            <Input type="number" value={f.output} onChange={(e: any) => set('output', e.target.value)} />
          </Field>
          <Field label="Cached" optional>
            <Input type="number" value={f.cached == null ? '' : f.cached} onChange={(e: any) => set('cached', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function AccountModal({ onClose }: { onClose: () => void }) {
  const ctx = useAdminCtx();
  const [f, setF] = useState<any>({ name: '', provider: 'OPENAI', email: '', balance: '$0.00' });
  const set = (k: string, v: any) => setF((o: any) => ({ ...o, [k]: v }));
  const save = () => {
    onClose();
    ctx.toast('Account linked');
  };
  return (
    <Modal
      title="Link AI account"
      sub="Connect a billing account so its credit balance and keys appear here."
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save}>
            Link account
          </Btn>
        </>
      }
    >
      <div className="stack-4">
        <div className="grid grid-2">
          <Field label="Account name">
            <Input value={f.name} onChange={(e: any) => set('name', e.target.value)} placeholder="OpenAI — Platform" autoFocus />
          </Field>
          <Field label="Provider">
            <Select
              options={[
                { value: 'OPENAI', label: 'OpenAI' },
                { value: 'ANTHROPIC', label: 'Anthropic' },
                { value: 'AZURE_OPENAI', label: 'Azure OpenAI' },
                { value: 'CUSTOM', label: 'Custom' },
              ]}
              value={f.provider}
              onChange={(e: any) => set('provider', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Billing email">
          <Input value={f.email} onChange={(e: any) => set('email', e.target.value)} placeholder="ops@superapp.ai" />
        </Field>
        <Field label="API key" help="Encrypted at rest and masked everywhere.">
          <Input type="password" placeholder="sk-…" />
        </Field>
      </div>
    </Modal>
  );
}

function AccountKeysModal({ account, onClose }: { account: any; onClose: () => void }) {
  const ctx = useAdminCtx();
  const keys = Array.from({ length: account.keys }, (_, i) => ({
    id: 'key_' + (i + 1),
    label: i === 0 ? 'Primary' : 'Key ' + (i + 1),
    masked: '••••••••' + (1000 + i * 7).toString(36),
    created: ['2025-11-02', '2026-02-14', '2026-05-30'][i] || '2026-01-01',
  }));
  return (
    <Modal
      title={account.name + ' — API keys'}
      sub={account.keys + ' active keys'}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Close</Btn>
          <Btn
            variant="primary"
            icon="plus"
            onClick={() => {
              onClose();
              ctx.toast('New key created');
            }}
          >
            Create key
          </Btn>
        </>
      }
    >
      <div className="stack-2">
        {keys.map((k) => (
          <div key={k.id} className="row spread" style={{ padding: '10px 0', borderBottom: '1px solid var(--p-border)' }}>
            <div className="stack" style={{ gap: 1 }}>
              <span className="t-sm t-strong">{k.label}</span>
              <span className="t-mono t-xs t-muted">{k.masked}</span>
            </div>
            <div className="row-2">
              <span className="t-xs t-muted">Created {k.created}</span>
              <Btn size="sm" icon="refresh" className="btn-plain" onClick={() => ctx.toast('Key rotated')} />
              <Btn size="sm" icon="trash" className="btn-plain-critical" onClick={() => ctx.toast('Key revoked')} />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

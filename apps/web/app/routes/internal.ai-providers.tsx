import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useActionData, useNavigation } from '@remix-run/react';
import {
  Page, Card, BlockStack, TextField, Button, Text, InlineStack, Select,
  Badge, Banner, Checkbox, InlineGrid, Divider,
} from '@shopify/polaris';
import { useState, useEffect } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { AiProviderService, type ProviderKind } from '~/services/internal/ai-provider.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { getPrisma } from '~/db.server';
import { syncProviderCatalogToDb, getLatestProviderFeaturePreset } from '~/services/ai/provider-model-catalog.server';

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

function withCurrentModelOption(
  options: Array<{ label: string; value: string }>,
  currentValue: string,
): Array<{ label: string; value: string }> {
  if (!currentValue) return options;
  if (options.some((opt) => opt.value === currentValue)) return options;
  return [...options, { label: `${currentValue} (current)`, value: currentValue }];
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

  const openaiEnv = process.env.OPENAI_API_KEY?.trim();
  const claudeEnv = process.env.ANTHROPIC_API_KEY?.trim();

  return json({
    providers,
    prices: pricesWithMeta,
    defaultProviders,
    providerRatings: Object.fromEntries(providerRatings),
    suggestedProviderId,
    envKeyStatus: {
      openai: openaiEnv ? `••••••••${openaiEnv.slice(-4)}` : null,
      claude: claudeEnv ? `••••••••${claudeEnv.slice(-4)}` : null,
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

  const ALLOWED_PROVIDERS: readonly ProviderKind[] = ['OPENAI', 'ANTHROPIC', 'AZURE_OPENAI', 'CUSTOM'];
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

function ClaudeExtraConfigForm({ provider }: { provider: { id: string; extraConfig: string | null } }) {
  const [skills, setSkills] = useState(() => {
    try {
      const c = provider.extraConfig ? JSON.parse(provider.extraConfig) as { skills?: string[] } : {};
      return c.skills?.join(', ') ?? '';
    } catch { return ''; }
  });
  const [codeExecution, setCodeExecution] = useState(() => {
    try {
      const c = provider.extraConfig ? JSON.parse(provider.extraConfig) as { codeExecution?: boolean } : {};
      return !!c.codeExecution;
    } catch { return false; }
  });
  return (
    <BlockStack gap="200">
      {provider.extraConfig ? (
        <Text as="p" variant="bodySm" tone="subdued">
          Claude: {(() => {
            try {
              const c = JSON.parse(provider.extraConfig) as { skills?: string[]; codeExecution?: boolean };
              const parts = [];
              if (c.skills?.length) parts.push(`Skills: ${c.skills.join(', ')}`);
              if (c.codeExecution) parts.push('Code execution: on');
              return parts.length ? parts.join(' · ') : '—';
            } catch { return '—'; }
          })()}
        </Text>
      ) : null}
      <Form method="post">
        <input type="hidden" name="intent" value="updateExtraConfig" />
        <input type="hidden" name="id" value={provider.id} />
        <input type="hidden" name="providerKind" value="ANTHROPIC" />
        <BlockStack gap="200">
          <TextField label="Claude skills (comma-separated)" name="claudeSkills" value={skills} onChange={setSkills} autoComplete="off" placeholder="pptx, xlsx" />
          <Checkbox label="Code execution" checked={codeExecution} onChange={setCodeExecution} />
          <input type="hidden" name="claudeCodeExecution" value={codeExecution ? 'true' : 'false'} />
          <Button submit size="slim" variant="secondary">Update Claude options</Button>
        </BlockStack>
      </Form>
    </BlockStack>
  );
}

function OpenAiExtraConfigForm({ provider }: { provider: { id: string; extraConfig: string | null } }) {
  const parsed = parseOpenAiExtraConfig(provider.extraConfig);
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>(parsed.reasoningEffort ?? 'medium');
  const [verbosity, setVerbosity] = useState<'low' | 'medium' | 'high'>(parsed.verbosity ?? 'medium');
  const [webSearch, setWebSearch] = useState(Boolean(parsed.webSearch));

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="updateExtraConfig" />
      <input type="hidden" name="id" value={provider.id} />
      <input type="hidden" name="providerKind" value="OPENAI" />
      <input type="hidden" name="openaiWebSearch" value={webSearch ? 'true' : 'false'} />
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone="subdued">OpenAI feature profile</Text>
        <Select
          label="Reasoning effort"
          name="openaiReasoningEffort"
          options={[
            { label: 'Low', value: 'low' },
            { label: 'Medium', value: 'medium' },
            { label: 'High', value: 'high' },
          ]}
          value={reasoningEffort}
          onChange={(v) => setReasoningEffort(v as 'low' | 'medium' | 'high')}
        />
        <Select
          label="Response verbosity"
          name="openaiVerbosity"
          options={[
            { label: 'Low', value: 'low' },
            { label: 'Medium', value: 'medium' },
            { label: 'High', value: 'high' },
          ]}
          value={verbosity}
          onChange={(v) => setVerbosity(v as 'low' | 'medium' | 'high')}
        />
        <Checkbox label="Enable web search tool" checked={webSearch} onChange={setWebSearch} />
        <Button submit size="slim" variant="secondary">Update OpenAI options</Button>
      </BlockStack>
    </Form>
  );
}

export default function InternalAiProviders() {
  const { providers, prices, defaultProviders, envKeyStatus, providerRatings, suggestedProviderId } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';

  const [addName, setAddName] = useState('');
  const [addProvider, setAddProvider] = useState('OPENAI');
  const [addDefaultModel, setAddDefaultModel] = useState('');
  const [addBaseUrl, setAddBaseUrl] = useState('');
  const [addApiKey, setAddApiKey] = useState('');
  const [addClaudeSkills, setAddClaudeSkills] = useState('');
  const [addClaudeCodeExecution, setAddClaudeCodeExecution] = useState(false);

  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState(defaultProviders?.openai?.model ?? '');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [claudeModel, setClaudeModel] = useState(defaultProviders?.claude?.model ?? '');
  const [claudeSkills, setClaudeSkills] = useState(() => {
    if (!defaultProviders?.claude?.extraConfig) return '';
    try {
      const c = JSON.parse(defaultProviders.claude.extraConfig) as { skills?: string[] };
      return c.skills?.join(', ') ?? '';
    } catch { return ''; }
  });
  const [claudeCodeExecution, setClaudeCodeExecution] = useState(() => {
    if (!defaultProviders?.claude?.extraConfig) return false;
    try {
      const c = JSON.parse(defaultProviders.claude.extraConfig) as { codeExecution?: boolean };
      return !!c.codeExecution;
    } catch { return false; }
  });

  useEffect(() => {
    setOpenaiModel((prev) => defaultProviders?.openai?.model ?? prev);
    setClaudeModel((prev) => defaultProviders?.claude?.model ?? prev);
    if (defaultProviders?.claude?.extraConfig) {
      try {
        const c = JSON.parse(defaultProviders.claude.extraConfig) as { skills?: string[]; codeExecution?: boolean };
        setClaudeSkills(c.skills?.join(', ') ?? '');
        setClaudeCodeExecution(!!c.codeExecution);
      } catch {
        // keep current
      }
    }
  }, [defaultProviders?.openai?.model, defaultProviders?.claude?.model, defaultProviders?.claude?.extraConfig]);
  const providerTypeOptions = [
    { label: 'OpenAI', value: 'OPENAI' },
    { label: 'Anthropic (Claude)', value: 'ANTHROPIC' },
    { label: 'Azure OpenAI', value: 'AZURE_OPENAI' },
    { label: 'Custom endpoint', value: 'CUSTOM' },
  ];
  const openaiProvider = providers.find((p) => p.provider === 'OPENAI');
  const claudeProvider = providers.find((p) => p.provider === 'ANTHROPIC');
  const suggestedProvider = providers.find((p) => p.id === suggestedProviderId);
  const openaiModelOptionsBase = [
    { label: 'Select OpenAI model (optional)', value: '' },
    ...prices
      .filter((pr) => pr.provider.provider === 'OPENAI')
      .map((pr) => ({ label: pr.displayName, value: pr.model })),
  ];
  const claudeModelOptionsBase = [
    { label: 'Select Claude model (optional)', value: '' },
    ...prices
      .filter((pr) => pr.provider.provider === 'ANTHROPIC')
      .map((pr) => ({ label: pr.displayName, value: pr.model })),
  ];
  const openaiModelOptions = withCurrentModelOption(openaiModelOptionsBase, openaiModel);
  const claudeModelOptions = withCurrentModelOption(claudeModelOptionsBase, claudeModel);
  const addProviderModelOptions =
    addProvider === 'OPENAI'
      ? withCurrentModelOption(openaiModelOptionsBase, addDefaultModel)
      : addProvider === 'ANTHROPIC'
        ? withCurrentModelOption(claudeModelOptionsBase, addDefaultModel)
        : [{ label: 'Enter model manually', value: '' }];

  return (
    <Page title="AI Providers" subtitle="Enter credentials only — model catalog, pricing, and usage stats are auto-managed.">
      <BlockStack gap="400">
        {data?.error ? (
          <Banner tone="critical" title="Error">
            <Text as="p">{data.error}</Text>
          </Banner>
        ) : null}

        {(envKeyStatus.openai || envKeyStatus.claude) ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Import existing environment keys</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Move credential ownership to the database so this page becomes the source of truth.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                OpenAI: {envKeyStatus.openai ?? 'not set'} · Claude: {envKeyStatus.claude ?? 'not set'}
              </Text>
              <Form method="post">
                <input type="hidden" name="intent" value="importEnvDefaults" />
                <InlineStack align="start">
                  <Button submit variant="secondary" loading={isSaving}>Import env keys to DB</Button>
                </InlineStack>
              </Form>
            </BlockStack>
          </Card>
        ) : null}

        {suggestedProvider ? (
          <Banner tone="info" title="Suggested provider">
            <Text as="p" variant="bodySm">
              {suggestedProvider.name} · rating {providerRatings[suggestedProvider.id]?.overall ?? 0}/100
              {' '}({providerRatings[suggestedProvider.id]?.label ?? 'No data'})
            </Text>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">How this page works</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              1) Save provider credentials. 2) Sync latest model/pricing/API feature presets from current provider docs. 3) Usage and costs are calculated from tracked tokens.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Default providers</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              These are the provider profiles used by the app when store settings select OpenAI or Claude defaults.
            </Text>

            <InlineGrid columns={{ xs: '1fr', md: '1fr 1fr' }} gap="300">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">OpenAI default</Text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="saveOpenAI" />
                    <BlockStack gap="150">
                      <TextField
                        label="OpenAI API key"
                        name="openaiApiKey"
                        type="password"
                        value={openaiApiKey}
                        onChange={setOpenaiApiKey}
                        autoComplete="off"
                        placeholder="Leave blank to keep existing key"
                        helpText={defaultProviders?.openai ? `Current: ${defaultProviders.openai.apiKeyMasked}` : undefined}
                      />
                      <Select
                        label="Default OpenAI model (optional)"
                        name="openaiModel"
                        options={openaiModelOptions}
                        value={openaiModel}
                        onChange={setOpenaiModel}
                      />
                      <InlineStack align="start">
                        <Button submit variant="primary" loading={isSaving}>Save OpenAI default</Button>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Saving credentials auto-syncs all OpenAI models and pricing.
                      </Text>
                    </BlockStack>
                  </Form>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Claude (Anthropic) default</Text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="saveClaude" />
                    <BlockStack gap="150">
                      <TextField
                        label="Claude API key"
                        name="claudeApiKey"
                        type="password"
                        value={claudeApiKey}
                        onChange={setClaudeApiKey}
                        autoComplete="off"
                        placeholder="Leave blank to keep existing key"
                        helpText={defaultProviders?.claude ? `Current: ${defaultProviders.claude.apiKeyMasked}` : undefined}
                      />
                      <Select
                        label="Default Claude model (optional)"
                        name="claudeModel"
                        options={claudeModelOptions}
                        value={claudeModel}
                        onChange={setClaudeModel}
                      />
                      <TextField
                        label="Agent skills (optional, comma-separated)"
                        name="claudeSkills"
                        value={claudeSkills}
                        onChange={setClaudeSkills}
                        autoComplete="off"
                        placeholder="pptx, xlsx, docx"
                      />
                      <Checkbox label="Enable code execution for Claude" checked={claudeCodeExecution} onChange={setClaudeCodeExecution} />
                      <input type="hidden" name="claudeCodeExecution" value={claudeCodeExecution ? 'true' : 'false'} />
                      <InlineStack align="start">
                        <Button submit variant="primary" loading={isSaving}>Save Claude default</Button>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Saving credentials auto-syncs all Claude models and pricing.
                      </Text>
                    </BlockStack>
                  </Form>
                </BlockStack>
              </Card>
            </InlineGrid>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Provider profiles</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Create and manage non-default provider endpoints (for example Azure OpenAI or custom gateways).
            </Text>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Add additional provider profile</Text>
            <Form method="post">
              <BlockStack gap="150">
                <TextField label="Name" name="name" value={addName} onChange={setAddName} autoComplete="off" helpText="A friendly label for this provider." />
                <Select label="Provider type" name="provider" options={providerTypeOptions} value={addProvider} onChange={setAddProvider} />
                {addProvider === 'OPENAI' || addProvider === 'ANTHROPIC' ? (
                  <Select
                    label="Default model (optional)"
                    name="defaultModel"
                    options={addProviderModelOptions}
                    value={addDefaultModel}
                    onChange={setAddDefaultModel}
                  />
                ) : (
                  <TextField label="Default model (optional)" name="defaultModel" value={addDefaultModel} onChange={setAddDefaultModel} autoComplete="off" />
                )}
                <TextField label="Base URL (optional)" name="baseUrl" value={addBaseUrl} onChange={setAddBaseUrl} autoComplete="off" />
                <TextField label="API key" name="apiKey" type="password" value={addApiKey} onChange={setAddApiKey} autoComplete="off" />
                {addProvider === 'ANTHROPIC' ? (
                  <>
                    <TextField
                      label="Claude agent skills (optional)"
                      name="claudeSkills"
                      value={addClaudeSkills}
                      onChange={setAddClaudeSkills}
                      autoComplete="off"
                      placeholder="pptx, xlsx, docx or custom skill_01Ab..."
                      helpText="Comma-separated: anthropic IDs (pptx, xlsx, docx, pdf) or custom skill IDs. Max 8 per request."
                    />
                    <Checkbox label="Enable Claude code execution" checked={addClaudeCodeExecution} onChange={setAddClaudeCodeExecution} />
                  </>
                ) : null}
                <input type="hidden" name="claudeCodeExecution" value={addClaudeCodeExecution ? 'true' : 'false'} />
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Create provider profile</Button>
                </InlineStack>
              </BlockStack>
            </Form>
            </BlockStack>

            <Divider />

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Configured provider profiles</Text>
              {providers.length === 0 ? (
                <BlockStack gap="100">
                  <Text as="p" tone="subdued">No providers configured yet.</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Create one using the form above.</Text>
                </BlockStack>
              ) : (
                providers.map(p => (
                  <Card key={p.id}>
                    <BlockStack gap="200">
                      <InlineStack gap="200" align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="headingSm">{p.name}</Text>
                          <Badge>{p.provider}</Badge>
                          {p.isActive ? <Badge tone="success">Global active</Badge> : null}
                        </InlineStack>
                        <Form method="post">
                          <input type="hidden" name="intent" value="activate" />
                          <input type="hidden" name="id" value={p.id} />
                          <Button submit disabled={p.isActive} size="slim">{p.isActive ? 'Active' : 'Set global active'}</Button>
                        </Form>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        API key: {(p as { apiKeyMasked?: string }).apiKeyMasked ?? '—'} · Default model: {p.model ?? '—'} · Base URL: {p.baseUrl ?? '—'}
                      </Text>
                      {providerRatings[p.id] ? (
                        <InlineStack gap="200" blockAlign="center">
                          {(() => {
                            const rating = providerRatings[p.id]!;
                            return (
                              <>
                                <Badge tone={rating.label === 'Recommended' ? 'success' : rating.label === 'Needs attention' ? 'critical' : 'info'}>
                                  {rating.label}
                                </Badge>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Rating {rating.overall}/100 · Success {rating.successRatePct}% ·
                                  Quality {rating.quality}% · Reliability {rating.reliability}% ·
                                  Value {rating.value}% · {rating.totalRequests} req (30d)
                                </Text>
                              </>
                            );
                          })()}
                        </InlineStack>
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">
                          No usage data yet to score this provider.
                        </Text>
                      )}
                      <InlineStack gap="200">
                        {(p.provider === 'OPENAI' || p.provider === 'ANTHROPIC') ? (
                          <>
                            <Form method="post">
                              <input type="hidden" name="intent" value="syncCatalog" />
                              <input type="hidden" name="providerId" value={p.id} />
                              <Button submit size="slim" variant="secondary" loading={isSaving}>
                                Sync pricing/models
                              </Button>
                            </Form>
                            <Form method="post">
                              <input type="hidden" name="intent" value="syncProviderUpdates" />
                              <input type="hidden" name="providerId" value={p.id} />
                              <Button submit size="slim" variant="secondary" loading={isSaving}>
                                Update API/features
                              </Button>
                            </Form>
                          </>
                        ) : null}
                      </InlineStack>
                      {p.provider === 'OPENAI' && (
                        <OpenAiExtraConfigForm provider={p} />
                      )}
                      {p.provider === 'ANTHROPIC' && (
                        <ClaudeExtraConfigForm provider={p} />
                      )}
                    </BlockStack>
                  </Card>
                ))
              )}
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Auto-synced model pricing and usage (30d)</Text>
              <InlineStack gap="200">
                <Form method="post">
                  <input type="hidden" name="intent" value="syncAllProviders" />
                  <Button submit size="slim" variant="primary" loading={isSaving}>Update all providers</Button>
                </Form>
                {openaiProvider ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="syncCatalog" />
                    <input type="hidden" name="providerId" value={openaiProvider.id} />
                    <Button submit size="slim" variant="secondary" loading={isSaving}>Sync OpenAI</Button>
                  </Form>
                ) : null}
                {claudeProvider ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="syncCatalog" />
                    <input type="hidden" name="providerId" value={claudeProvider.id} />
                    <Button submit size="slim" variant="secondary" loading={isSaving}>Sync Claude</Button>
                  </Form>
                ) : null}
              </InlineStack>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Manual pricing entry is removed. Pricing is fetched from catalog APIs and persisted to the database per provider.
            </Text>
            {prices.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e1e3e5', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Provider</th>
                      <th style={{ padding: '8px' }}>Model</th>
                      <th style={{ padding: '8px' }}>Info</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Input (c/1M)</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Output (c/1M)</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Cached (c/1M)</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>30d requests</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>30d cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map((pr) => (
                      <tr key={pr.id} style={{ borderBottom: '1px solid #f1f2f3' }}>
                        <td style={{ padding: '8px' }}>{pr.provider.name}</td>
                        <td style={{ padding: '8px' }}>
                          <InlineStack gap="200">
                            <Text as="span" variant="bodySm">{pr.displayName}</Text>
                            {(pr.provider.model && pr.provider.model === pr.model) ? <Badge tone="info">default</Badge> : null}
                          </InlineStack>
                        </td>
                        <td style={{ padding: '8px', maxWidth: 320 }}>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {pr.description ? pr.description.slice(0, 120) : '—'}
                            {pr.contextWindow ? ` · ctx ${pr.contextWindow.toLocaleString()}` : ''}
                          </Text>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{pr.inputPer1MTokensCents.toLocaleString()}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{pr.outputPer1MTokensCents.toLocaleString()}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{pr.cachedInputPer1MTokensCents?.toLocaleString() ?? '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{pr.usage30d?.requests?.toLocaleString() ?? '0'}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>${(((pr.usage30d?.costCents ?? 0) / 100)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Text as="p" variant="bodySm" tone="subdued">
                No synced catalog data yet. Save OpenAI/Claude credentials and sync the catalog.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

import { json, redirect } from '@remix-run/node';
import type { SerializeFrom } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { AiProviderService, type ProviderKind } from '~/services/internal/ai-provider.service';
import { AiAccountObservabilityService } from '~/services/internal/ai-account-observability.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { getPrisma } from '~/db.server';
import { encryptJson } from '~/services/security/crypto.server';
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
  EmptyState,
  fmtCents,
  fmtNum,
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

const ALLOWED_PROVIDERS: readonly ProviderKind[] = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'AZURE_OPENAI', 'CUSTOM'];

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

/** Client-safe parse of the ANTHROPIC extraConfig shape for the provider card badges + edit modal. */
function parseAnthropicDisplay(extraConfig: string | null): { skills: string[]; codeExec: boolean } {
  if (!extraConfig) return { skills: [], codeExec: false };
  try {
    const parsed = JSON.parse(extraConfig) as {
      skills?: string[];
      codeExecution?: boolean;
      anthropicFeatures?: { skills?: string[]; codeExecution?: boolean };
    };
    const skills = parsed.anthropicFeatures?.skills ?? parsed.skills ?? [];
    const codeExec = parsed.anthropicFeatures?.codeExecution ?? parsed.codeExecution ?? false;
    return { skills: Array.isArray(skills) ? skills.filter((s): s is string => typeof s === 'string') : [], codeExec: Boolean(codeExec) };
  } catch {
    return { skills: [], codeExec: false };
  }
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const service = new AiProviderService();
  const prisma = getPrisma();
  const providersRaw = await service.list();

  const [maskedKeys, defaultProviders, prices, usageRows, appSettings, accounts] = await Promise.all([
    Promise.all(providersRaw.map((p) => service.getApiKeyMasked(p.id))),
    service.getDefaultProvidersForSettings(),
    prisma.aiModelPrice.findMany({
      where: { isActive: true },
      include: { provider: true },
      orderBy: [{ providerId: 'asc' }, { model: 'asc' }],
      take: 2000,
    }),
    prisma.aiUsage.findMany({
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
    }),
    prisma.appSettings.findUnique({
      where: { id: 'singleton' },
      select: { fallbackAiProviderId: true },
    }),
    new AiAccountObservabilityService().listProviderAccountSnapshots(),
  ]);

  const providerCatalogById = new Map<string, Map<string, ModelCatalogMeta>>();
  for (const p of providersRaw) {
    const map = new Map<string, ModelCatalogMeta>();
    for (const meta of parseModelCatalog(p.extraConfig)) {
      if (meta.model) map.set(meta.model, meta);
    }
    providerCatalogById.set(p.id, map);
  }

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

  // Slim client payload: never ship apiKeyEnc (even encrypted) or the full provider row on prices.
  const providers = providersRaw.map((p, i) => {
    const seed = providerRatingSeed.get(p.id);
    return {
      id: p.id,
      name: p.name,
      provider: p.provider,
      baseUrl: p.baseUrl,
      model: p.model,
      isActive: p.isActive,
      extraConfig: p.extraConfig,
      apiKeyMasked: maskedKeys[i],
      calls30d: seed?.totalRequests ?? 0,
      costCents30d: seed?.totalCostCents ?? 0,
    };
  });
  const totals30d = providers.reduce(
    (acc, p) => ({ calls: acc.calls + p.calls30d, costCents: acc.costCents + p.costCents30d }),
    { calls: 0, costCents: 0 },
  );

  const pricesWithMeta = prices.map((pr) => {
    const catalog = providerCatalogById.get(pr.providerId);
    const meta = catalog?.get(pr.model);
    const usage = usageByProviderModel.get(`${pr.providerId}:${pr.model}`) ?? null;
    return {
      id: pr.id,
      providerId: pr.providerId,
      providerName: pr.provider.name,
      model: pr.model,
      inputPer1MTokensCents: pr.inputPer1MTokensCents,
      outputPer1MTokensCents: pr.outputPer1MTokensCents,
      cachedInputPer1MTokensCents: pr.cachedInputPer1MTokensCents,
      displayName: meta?.displayName ?? pr.model,
      description: meta?.description ?? null,
      contextWindow: meta?.contextWindow ?? null,
      usage30d: usage,
    };
  });

  const openaiEnv = process.env.OPENAI_API_KEY?.trim();
  const claudeEnv = process.env.ANTHROPIC_API_KEY?.trim();
  const geminiEnv = process.env.GEMINI_API_KEY?.trim();

  return json({
    providers,
    prices: pricesWithMeta,
    accounts,
    totals30d,
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
    return json({ ok: true, message: 'Fallback provider saved' });
  }

  if (intent === 'activate') {
    const id = String(form.get('id') ?? '');
    if (!id) return json({ error: 'Missing id' }, { status: 400 });
    const provider = await prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) return json({ error: 'Provider not found' }, { status: 404 });
    await service.setActive(id);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_ACTIVATED', resource: `provider:${id}` });
    return json({ ok: true, message: `${provider.name} set as active` });
  }

  if (intent === 'deleteProvider') {
    const id = String(form.get('id') ?? '');
    if (!id) return json({ error: 'Missing id' }, { status: 400 });
    const provider = await prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) return json({ error: 'Provider not found' }, { status: 404 });
    if (provider.isActive) {
      return json({ error: 'Cannot delete the active provider. Set another provider active first.' }, { status: 400 });
    }
    try {
      await prisma.$transaction([
        prisma.shop.updateMany({ where: { aiProviderOverrideId: id }, data: { aiProviderOverrideId: null } }),
        prisma.appSettings.updateMany({ where: { id: 'singleton', fallbackAiProviderId: id }, data: { fallbackAiProviderId: null } }),
        prisma.aiUsage.deleteMany({ where: { providerId: id } }),
        prisma.aiModelPrice.deleteMany({ where: { providerId: id } }),
        prisma.aiProvider.delete({ where: { id } }),
      ]);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Provider delete failed.' }, { status: 400 });
    }
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_DELETED', resource: `provider:${id}`, details: { name: provider.name } });
    return json({ ok: true, message: `${provider.name} deleted` });
  }

  if (intent === 'updateProvider') {
    const id = String(form.get('id') ?? '');
    if (!id) return json({ error: 'Missing id' }, { status: 400 });
    const existing = await prisma.aiProvider.findUnique({ where: { id } });
    if (!existing) return json({ error: 'Provider not found' }, { status: 404 });

    const name = String(form.get('name') ?? '').trim();
    if (!name) return json({ error: 'Name is required.' }, { status: 400 });
    const providerRaw = String(form.get('provider') ?? existing.provider);
    if (!ALLOWED_PROVIDERS.includes(providerRaw as ProviderKind)) {
      return json({ error: `Unknown provider kind: ${providerRaw}` }, { status: 400 });
    }
    const kind = providerRaw as ProviderKind;
    const model = String(form.get('defaultModel') ?? '').trim();
    const baseUrl = String(form.get('baseUrl') ?? '').trim();
    const apiKey = String(form.get('apiKey') ?? '').trim();

    try {
      const data: Record<string, unknown> = { name, provider: kind, model: model || null, baseUrl: baseUrl || null };
      if (apiKey) data.apiKeyEnc = encryptJson({ apiKey });
      await prisma.aiProvider.update({ where: { id }, data });

      if (kind === 'ANTHROPIC') {
        const skillsRaw = String(form.get('claudeSkills') ?? '').trim();
        const codeExecution = form.get('claudeCodeExecution') === 'true';
        const skills = skillsRaw ? skillsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : [];
        await service.updateExtraConfig(id, {
          anthropicFeatures: { skills, codeExecution },
          skills: skills.length ? skills : undefined,
          codeExecution,
        });
      }

      const active = form.get('active') === 'true';
      if (active && !existing.isActive) await service.setActive(id);
      else if (!active && existing.isActive) {
        await prisma.aiProvider.update({ where: { id }, data: { isActive: false } });
      }

      const fallback = form.get('fallback') === 'true';
      if (fallback) {
        await prisma.appSettings.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', fallbackAiProviderId: id },
          update: { fallbackAiProviderId: id },
        });
      } else {
        await prisma.appSettings.updateMany({ where: { id: 'singleton', fallbackAiProviderId: id }, data: { fallbackAiProviderId: null } });
      }
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Provider update failed.' }, { status: 400 });
    }

    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_UPDATED', resource: `provider:${id}`, details: { name, provider: kind } });
    return json({ ok: true, message: 'Provider updated' });
  }

  if (intent === 'savePricing') {
    const id = String(form.get('id') ?? '').trim();
    const providerId = String(form.get('providerId') ?? '').trim();
    const model = String(form.get('model') ?? '').trim();
    if (!providerId || !model) return json({ error: 'Provider and model are required.' }, { status: 400 });
    const input = Number(String(form.get('input') ?? '').trim());
    const output = Number(String(form.get('output') ?? '').trim());
    const cachedRaw = String(form.get('cached') ?? '').trim();
    const cached = cachedRaw === '' ? null : Number(cachedRaw);
    if (
      !Number.isFinite(input) || input < 0 ||
      !Number.isFinite(output) || output < 0 ||
      (cached != null && (!Number.isFinite(cached) || cached < 0))
    ) {
      return json({ error: 'Prices must be non-negative numbers (cents per 1M tokens).' }, { status: 400 });
    }
    const provider = await prisma.aiProvider.findUnique({ where: { id: providerId } });
    if (!provider) return json({ error: 'Provider not found' }, { status: 404 });
    const data = {
      providerId,
      model,
      inputPer1MTokensCents: Math.round(input),
      outputPer1MTokensCents: Math.round(output),
      cachedInputPer1MTokensCents: cached == null ? null : Math.round(cached),
      isActive: true,
    };
    try {
      if (id) {
        await prisma.aiModelPrice.update({ where: { id }, data });
      } else {
        // New price row supersedes any previous active row for this provider+model.
        await prisma.$transaction([
          prisma.aiModelPrice.updateMany({ where: { providerId, model, isActive: true }, data: { isActive: false } }),
          prisma.aiModelPrice.create({ data }),
        ]);
      }
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Pricing save failed.' }, { status: 400 });
    }
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'MODEL_PRICE_SAVED', resource: `provider:${providerId}`, details: { model } });
    return json({ ok: true, message: id ? 'Pricing updated' : 'Pricing added' });
  }

  if (intent === 'deletePricing') {
    const id = String(form.get('id') ?? '').trim();
    if (!id) return json({ error: 'Missing pricing id' }, { status: 400 });
    try {
      const price = await prisma.aiModelPrice.delete({ where: { id } });
      await activity.log({ actor: 'INTERNAL_ADMIN', action: 'MODEL_PRICE_DELETED', resource: `provider:${price.providerId}`, details: { model: price.model } });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Pricing delete failed.' }, { status: 400 });
    }
    return json({ ok: true, message: 'Pricing deleted' });
  }

  if (intent === 'saveAccount') {
    const providerId = String(form.get('providerId') ?? '').trim();
    if (!providerId) return json({ error: 'Missing provider id' }, { status: 400 });
    const provider = await prisma.aiProvider.findUnique({ where: { id: providerId } });
    if (!provider) return json({ error: 'Provider not found' }, { status: 404 });

    let parsed: { account?: Record<string, string>; billing?: Record<string, number | string> } = {};
    try {
      parsed = provider.extraConfig ? (JSON.parse(provider.extraConfig) as typeof parsed) : {};
    } catch {
      parsed = {};
    }
    const account = parsed.account ?? {};
    const billing = parsed.billing ?? {};

    try {
      await new AiAccountObservabilityService().updateProviderAccount(providerId, {
        accountName: String(form.get('accountName') ?? ''),
        accountEmail: String(form.get('accountEmail') ?? ''),
        // Preserve fields the modal does not edit (managed on /internal/ai-accounts).
        accountId: typeof account.accountId === 'string' ? account.accountId : '',
        dashboardUrl: typeof account.dashboardUrl === 'string' ? account.dashboardUrl : '',
        currentBalanceUsd: typeof billing.currentBalanceUsd === 'number' ? billing.currentBalanceUsd : null,
        dailyLimitUsd: typeof billing.dailyLimitUsd === 'number' ? billing.dailyLimitUsd : null,
        alertLimitUsd: typeof billing.alertLimitUsd === 'number' ? billing.alertLimitUsd : null,
        currency: typeof billing.currency === 'string' ? billing.currency : 'USD',
      });
      const apiKey = String(form.get('apiKey') ?? '').trim();
      if (apiKey) {
        await prisma.aiProvider.update({ where: { id: providerId }, data: { apiKeyEnc: encryptJson({ apiKey }) } });
      }
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Account save failed.' }, { status: 400 });
    }

    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_ACCOUNT_UPDATED', resource: `provider:${providerId}` });
    return json({ ok: true, message: 'Account details saved' });
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

    try {
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
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Environment key import failed.' }, { status: 400 });
    }

    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'ENV_KEYS_IMPORTED_TO_PROVIDER_DB' });
    return json({ ok: true, message: 'Imported API keys from environment' });
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

  // Respect the modal's "Set as active" checkbox; default true when the field is absent (legacy behavior).
  const activeRaw = form.get('active');
  const isActive = activeRaw == null ? true : String(activeRaw) === 'true';

  let created;
  try {
    created = await service.create({
      name,
      provider,
      apiKey,
      model: model || undefined,
      baseUrl: baseUrl || undefined,
      isActive,
      extraConfig: extraConfig ?? undefined,
    });
    if (provider === 'OPENAI' || provider === 'ANTHROPIC') {
      await syncProviderCatalogToDb({ providerId: created.id, providerKind: created.provider });
    }
    if (form.get('fallback') === 'true') {
      await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', fallbackAiProviderId: created.id },
        update: { fallbackAiProviderId: created.id },
      });
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Provider create failed.' }, { status: 400 });
  }

  await activity.log({ actor: 'INTERNAL_ADMIN', action: 'PROVIDER_CREATED', resource: `provider:${name}`, details: { provider } });
  return json({ ok: true, message: 'Provider added' });
}

type LoaderData = SerializeFrom<typeof loader>;
type ProviderRow = LoaderData['providers'][number];
type PriceRow = LoaderData['prices'][number];
type AccountRow = LoaderData['accounts'][number];

type ActionResult = { ok?: boolean; message?: string; error?: string };

type ConfirmSpec = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'primary' | 'critical';
  icon: string;
  onConfirm: () => void;
};

/** Submit an intent to this route's action; toast the server's response (error styling on failure). */
function useIntentSubmit(onSuccess?: () => void) {
  const ctx = useAdminCtx();
  const fetcher = useFetcher<ActionResult>();
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (fetcher.data.error) {
      ctx.toast(fetcher.data.error, true);
    } else {
      if (fetcher.data.message) ctx.toast(fetcher.data.message);
      onSuccessRef.current?.();
    }
  }, [fetcher.state, fetcher.data, ctx]);

  const submit = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fetcher.submit(fd, { method: 'post' });
  };

  return { submit, busy: fetcher.state !== 'idle' };
}

export default function AdminProviders() {
  const { providers, prices, accounts, totals30d, providerRatings, fallbackProviderId, envKeyStatus } =
    useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ops = useIntentSubmit();
  const [modal, setModal] = useState<ProviderRow | 'new' | null>(null);
  const [tab, setTab] = useState('providers');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [priceModal, setPriceModal] = useState<PriceRow | 'new' | null>(null);
  const [acctModal, setAcctModal] = useState<AccountRow | 'link' | null>(null);

  const activeProvider = providers.find((p) => p.isActive) ?? null;
  const hasEnvKeys = Boolean(envKeyStatus.openai || envKeyStatus.claude);

  const headAction =
    tab === 'accounts' ? (
      <Btn variant="primary" icon="plus" disabled={providers.length === 0} onClick={() => setAcctModal('link')}>
        Link account
      </Btn>
    ) : tab === 'pricing' ? (
      <Btn variant="primary" icon="plus" disabled={providers.length === 0} onClick={() => setPriceModal('new')}>
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
        <StatTile label="Providers" value={providers.length} icon="connect" tone="info" />
        <StatTile
          label="Active"
          value={activeProvider ? activeProvider.name : '—'}
          sub={activeProvider ? `${activeProvider.model ?? 'no default model'} · global default` : 'No active provider'}
          icon="check"
          tone="success"
        />
        <StatTile label="Calls (30d)" value={fmtNum(totals30d.calls)} icon="magic" tone="magic" />
        <StatTile label="Spend (30d)" value={fmtCents(totals30d.costCents)} icon="chart" tone="success" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'providers', label: 'Providers', badge: providers.length },
            { id: 'accounts', label: 'Accounts', badge: accounts.length },
            { id: 'pricing', label: 'Model pricing', badge: prices.length },
          ]}
        />
      </Card>
      {tab === 'providers' && (
        providers.length === 0 ? (
          <Card pad>
            <EmptyState icon="connect" title="No AI providers yet" action={
              <div className="row-2" style={{ justifyContent: 'center' }}>
                <Btn variant="primary" icon="plus" onClick={() => setModal('new')}>
                  Add provider
                </Btn>
                {hasEnvKeys && (
                  <Btn icon="refresh" loading={ops.busy} onClick={() => ops.submit({ intent: 'importEnvDefaults' })}>
                    Import keys from env
                  </Btn>
                )}
              </div>
            }>
              Connect OpenAI or Anthropic to power merchant module generation.
            </EmptyState>
          </Card>
        ) : (
        <div className="grid grid-2">
          {providers.map((p) => {
            const anth = p.provider === 'ANTHROPIC' ? parseAnthropicDisplay(p.extraConfig) : { skills: [], codeExec: false };
            const rating = providerRatings[p.id];
            return (
            <div key={p.id} className={'card card-pad provider-card' + (p.isActive ? ' active' : '')}>
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
                {p.isActive ? (
                  <Badge tone="success" dot>
                    Active
                  </Badge>
                ) : p.id === fallbackProviderId ? (
                  <Badge tone="info">Fallback</Badge>
                ) : null}
              </div>
              <KV
                rows={[
                  ['Model', p.model ? <MonoChip key="m">{p.model}</MonoChip> : '—'],
                  ['Base URL', p.baseUrl ? <span key="u" className="t-mono t-xs t-trunc" style={{ maxWidth: 200, display: 'inline-block' }}>{p.baseUrl}</span> : '—'],
                  ['API key', <span key="k" className="t-mono">{p.apiKeyMasked}</span>],
                  ['Calls (30d)', fmtNum(p.calls30d)],
                  ['Cost (30d)', fmtCents(p.costCents30d)],
                  rating ? ['Rating (30d)', `${rating.overall}/100 · ${rating.label}`] : null,
                ]}
              />
              {(anth.skills.length > 0 || anth.codeExec) && (
                <div className="row-2" style={{ marginTop: 10 }}>
                  <span className="t-xs t-muted">Skills:</span>
                  {anth.skills.map((sk) => (
                    <Badge key={sk} tone="magic">
                      {sk}
                    </Badge>
                  ))}
                  {anth.codeExec && <Badge tone="warning">Code exec</Badge>}
                </div>
              )}
              <div className="divider" style={{ margin: '14px 0' }} />
              <div className="row-2">
                {!p.isActive && (
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
                        onConfirm: () => ops.submit({ intent: 'activate', id: p.id }),
                      })
                    }
                  >
                    Set active
                  </Btn>
                )}
                <Btn size="sm" icon="edit" onClick={() => setModal(p)}>
                  Edit
                </Btn>
                <Btn size="sm" icon="transfer" className="btn-plain" onClick={() => ctx.go('#/admin/usage')}>
                  Logs
                </Btn>
                <span className="grow" />
                <Btn
                  size="sm"
                  className="btn-plain-critical"
                  icon="trash"
                  disabled={p.isActive}
                  onClick={() =>
                    setConfirm({
                      title: 'Delete provider',
                      message: 'Delete ' + p.name + '? Its usage history and pricing rows are removed, and stores using it fall back to the global default. This cannot be undone.',
                      confirmLabel: 'Delete provider',
                      tone: 'critical',
                      icon: 'trash',
                      onConfirm: () => ops.submit({ intent: 'deleteProvider', id: p.id }),
                    })
                  }
                />
              </div>
            </div>
            );
          })}
        </div>
        )
      )}
      {tab === 'accounts' && (
        accounts.length === 0 ? (
          <Card pad>
            <EmptyState icon="key" title="No AI accounts yet" action={
              <Btn variant="primary" icon="plus" onClick={() => setTab('providers')}>
                Add a provider first
              </Btn>
            }>
              Add a provider, then link its billing account details here.
            </EmptyState>
          </Card>
        ) : (
        <div className="grid grid-2">
          {accounts.map((a) => {
            const providerForAccount = providers.find((p) => p.id === a.providerId) ?? null;
            return (
            <Card key={a.providerId} pad>
              <div className="row spread" style={{ marginBottom: 12 }}>
                <div className="row-3">
                  <span className="tile-ico" style={{ background: 'var(--p-surface-secondary)' }}>
                    <Icon name="key" size={18} />
                  </span>
                  <div className="stack" style={{ gap: 1 }}>
                    <span className="t-strong">{a.accountName ?? a.providerName}</span>
                    <span className="t-xs t-muted">{a.accountEmail ?? a.providerKind}</span>
                  </div>
                </div>
                <StatusBadge value={a.isActive ? 'ACTIVE' : 'INACTIVE'} />
              </div>
              <KV
                rows={[
                  ['Balance / credit', a.currentBalanceUsd == null ? '—' : <span key="b" className="t-strong">{`$${a.currentBalanceUsd.toFixed(2)} ${a.currency}`}</span>],
                  ['Spend (24h / 7d)', `$${a.spend24hUsd.toFixed(2)} / $${a.spend7dUsd.toFixed(2)}`],
                  ['Requests (24h / 7d)', `${fmtNum(a.request24h)} / ${fmtNum(a.request7d)}`],
                  ['API key', <span key="k" className="t-mono">{providerForAccount?.apiKeyMasked ?? '—'}</span>],
                  ['Used by', <Badge key="u">{a.providerName}</Badge>],
                ]}
              />
              <div className="row-2" style={{ marginTop: 12 }}>
                <Btn size="sm" icon="edit" onClick={() => setAcctModal(a)}>
                  Edit
                </Btn>
                <Btn size="sm" icon="chart" className="btn-plain" onClick={() => ctx.go('#/admin/ai-accounts')}>
                  Limits &amp; spend
                </Btn>
                {a.dashboardUrl && (
                  <Btn size="sm" icon="external" className="btn-plain" onClick={() => window.open(a.dashboardUrl!, '_blank', 'noopener')}>
                    Dashboard
                  </Btn>
                )}
              </div>
            </Card>
            );
          })}
        </div>
        )
      )}
      {tab === 'pricing' && (
        <Card>
          <CardHead
            title="Model pricing"
            sub="Cents per 1M tokens · used to compute per-call cost"
            actions={
              <Btn size="sm" icon="plus" disabled={providers.length === 0} onClick={() => setPriceModal('new')}>
                Add pricing
              </Btn>
            }
          />
          {prices.length === 0 ? (
            <EmptyState icon="chart" title="No model pricing yet" action={
              <Btn variant="primary" icon="plus" disabled={providers.length === 0} onClick={() => setPriceModal('new')}>
                Add pricing
              </Btn>
            }>
              Add per-model prices so token usage can be converted into per-call cost.
            </EmptyState>
          ) : (
          <DataTable
            rowKey="id"
            columns={[
              { key: 'provider', label: 'Provider', render: (r: PriceRow) => r.providerName },
              { key: 'model', label: 'Model', render: (r: PriceRow) => <MonoChip>{r.model}</MonoChip> },
              { key: 'input', label: 'Input ¢/1M', num: true, render: (r: PriceRow) => r.inputPer1MTokensCents },
              { key: 'output', label: 'Output ¢/1M', num: true, render: (r: PriceRow) => r.outputPer1MTokensCents },
              { key: 'cached', label: 'Cached ¢/1M', num: true, render: (r: PriceRow) => (r.cachedInputPer1MTokensCents == null ? '—' : r.cachedInputPer1MTokensCents) },
              {
                key: 'act',
                label: '',
                render: (r: PriceRow) => (
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
                          onConfirm: () => ops.submit({ intent: 'deletePricing', id: r.id }),
                        })
                      }
                    />
                  </div>
                ),
              },
            ]}
            rows={prices}
          />
          )}
        </Card>
      )}
      {modal && <ProviderModal provider={modal === 'new' ? null : modal} fallbackProviderId={fallbackProviderId} onClose={() => setModal(null)} />}
      {priceModal && <PricingModal price={priceModal === 'new' ? null : priceModal} providers={providers} onClose={() => setPriceModal(null)} />}
      {acctModal && <AccountModal account={acctModal === 'link' ? null : acctModal} providers={providers} onClose={() => setAcctModal(null)} />}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function ProviderModal({ provider, fallbackProviderId, onClose }: { provider: ProviderRow | null; fallbackProviderId: string | null; onClose: () => void }) {
  const { submit, busy } = useIntentSubmit(onClose);
  const anth = provider ? parseAnthropicDisplay(provider.extraConfig) : { skills: [], codeExec: false };
  const [f, setF] = useState({
    name: provider?.name ?? '',
    provider: provider?.provider ?? 'OPENAI',
    model: provider?.model ?? '',
    baseUrl: provider?.baseUrl ?? '',
    apiKey: '',
    skillsText: anth.skills.join(', '),
    codeExec: anth.codeExec,
    active: provider?.isActive ?? false,
    fallback: provider ? provider.id === fallbackProviderId : false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
  const type = f.provider;
  const save = () =>
    submit({
      intent: provider ? 'updateProvider' : 'create',
      ...(provider ? { id: provider.id } : {}),
      name: f.name,
      provider: f.provider,
      apiKey: f.apiKey,
      defaultModel: f.model,
      baseUrl: f.baseUrl,
      claudeSkills: f.skillsText,
      claudeCodeExecution: f.codeExec ? 'true' : 'false',
      active: f.active ? 'true' : 'false',
      fallback: f.fallback ? 'true' : 'false',
    });
  return (
    <Modal
      title={provider ? 'Edit provider' : 'Add AI provider'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={busy} disabled={busy} onClick={save}>
            {provider ? 'Save changes' : 'Add provider'}
          </Btn>
        </>
      }
    >
      <div className="stack-4">
        <div className="grid grid-2">
          <Field label="Display name">
            <Input value={f.name} onChange={(e: ChangeEvent<HTMLInputElement>) => set('name', e.target.value)} placeholder="OpenAI Production" />
          </Field>
          <Field label="Provider type">
            <Select
              options={[
                { value: 'OPENAI', label: 'OpenAI' },
                { value: 'ANTHROPIC', label: 'Anthropic (Claude)' },
                { value: 'GEMINI', label: 'Google (Gemini)' },
                { value: 'AZURE_OPENAI', label: 'Azure OpenAI' },
                { value: 'CUSTOM', label: 'Custom (OpenAI-compatible)' },
              ]}
              value={type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => set('provider', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-2">
          <Field label="Default model">
            <Input mono value={f.model} onChange={(e: ChangeEvent<HTMLInputElement>) => set('model', e.target.value)} placeholder="gpt-4o" />
          </Field>
          <Field label="Base URL" optional={type === 'OPENAI'}>
            <Input mono value={f.baseUrl} onChange={(e: ChangeEvent<HTMLInputElement>) => set('baseUrl', e.target.value)} placeholder="https://api.openai.com/v1" />
          </Field>
        </div>
        <Field label="API key" help="Encrypted at rest. Leave blank to keep the existing key.">
          <Input
            type="password"
            value={f.apiKey}
            onChange={(e: ChangeEvent<HTMLInputElement>) => set('apiKey', e.target.value)}
            placeholder={provider ? `${provider.apiKeyMasked} (unchanged)` : 'sk-…'}
          />
        </Field>
        {type === 'ANTHROPIC' && (
          <Card className="card-subdued" pad>
            <div className="stack-3">
              <div className="t-h3">Claude options</div>
              <Field label="Agent skills" help="Comma-separated: pptx, xlsx, docx, or custom skill IDs">
                <Input value={f.skillsText} onChange={(e: ChangeEvent<HTMLInputElement>) => set('skillsText', e.target.value)} placeholder="pptx, xlsx" />
              </Field>
              <label className="checkbox">
                <Toggle checked={f.codeExec} onChange={(e: ChangeEvent<HTMLInputElement>) => set('codeExec', e.target.checked)} />
                <span className="t-sm">Enable code execution (beta)</span>
              </label>
            </div>
          </Card>
        )}
        <div className="grid grid-2">
          <Checkbox checked={f.active} onChange={(e: ChangeEvent<HTMLInputElement>) => set('active', e.target.checked)} label="Set as active provider" sub="Global default for module generation" />
          <Checkbox checked={f.fallback} onChange={(e: ChangeEvent<HTMLInputElement>) => set('fallback', e.target.checked)} label="Use as fallback" sub="Tried if the active provider fails" />
        </div>
      </div>
    </Modal>
  );
}

function PricingModal({ price, providers, onClose }: { price: PriceRow | null; providers: ProviderRow[]; onClose: () => void }) {
  const { submit, busy } = useIntentSubmit(onClose);
  const [f, setF] = useState({
    providerId: price?.providerId ?? providers[0]?.id ?? '',
    model: price?.model ?? '',
    input: price ? String(price.inputPer1MTokensCents) : '',
    output: price ? String(price.outputPer1MTokensCents) : '',
    cached: price?.cachedInputPer1MTokensCents != null ? String(price.cachedInputPer1MTokensCents) : '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
  const save = () =>
    submit({
      intent: 'savePricing',
      id: price?.id ?? '',
      providerId: f.providerId,
      model: f.model,
      input: f.input,
      output: f.output,
      cached: f.cached,
    });
  return (
    <Modal
      title={price ? 'Edit pricing' : 'Add model pricing'}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={busy} disabled={busy} onClick={save}>
            Save pricing
          </Btn>
        </>
      }
    >
      <div className="stack-4">
        <div className="grid grid-2">
          <Field label="Provider">
            <Select
              options={providers.map((p) => ({ value: p.id, label: p.name }))}
              value={f.providerId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => set('providerId', e.target.value)}
            />
          </Field>
          <Field label="Model">
            <Input mono value={f.model} onChange={(e: ChangeEvent<HTMLInputElement>) => set('model', e.target.value)} placeholder="gpt-4o" />
          </Field>
        </div>
        <div className="t-h3">
          Price <span className="t-xs t-muted">(cents per 1M tokens)</span>
        </div>
        <div className="grid grid-3">
          <Field label="Input">
            <Input type="number" value={f.input} onChange={(e: ChangeEvent<HTMLInputElement>) => set('input', e.target.value)} />
          </Field>
          <Field label="Output">
            <Input type="number" value={f.output} onChange={(e: ChangeEvent<HTMLInputElement>) => set('output', e.target.value)} />
          </Field>
          <Field label="Cached" optional>
            <Input type="number" value={f.cached} onChange={(e: ChangeEvent<HTMLInputElement>) => set('cached', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function AccountModal({ account, providers, onClose }: { account: AccountRow | null; providers: ProviderRow[]; onClose: () => void }) {
  const { submit, busy } = useIntentSubmit(onClose);
  const [f, setF] = useState({
    providerId: account?.providerId ?? providers[0]?.id ?? '',
    name: account?.accountName ?? '',
    email: account?.accountEmail ?? '',
    apiKey: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
  const save = () =>
    submit({
      intent: 'saveAccount',
      providerId: f.providerId,
      accountName: f.name,
      accountEmail: f.email,
      apiKey: f.apiKey,
    });
  return (
    <Modal
      title={account ? `${account.providerName} — account` : 'Link AI account'}
      sub="Connect a billing account so its details appear here. Limits and balances are managed under Limits & spend."
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={busy} disabled={busy} onClick={save}>
            {account ? 'Save account' : 'Link account'}
          </Btn>
        </>
      }
    >
      <div className="stack-4">
        <div className="grid grid-2">
          <Field label="Account name">
            <Input value={f.name} onChange={(e: ChangeEvent<HTMLInputElement>) => set('name', e.target.value)} placeholder="OpenAI — Platform" autoFocus />
          </Field>
          <Field label="Provider">
            <Select
              options={providers.map((p) => ({ value: p.id, label: p.name }))}
              value={f.providerId}
              disabled={Boolean(account)}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => set('providerId', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Billing email">
          <Input value={f.email} onChange={(e: ChangeEvent<HTMLInputElement>) => set('email', e.target.value)} placeholder="billing@example.com" />
        </Field>
        <Field label="API key" optional help="Encrypted at rest and masked everywhere. Leave blank to keep the existing key.">
          <Input type="password" value={f.apiKey} onChange={(e: ChangeEvent<HTMLInputElement>) => set('apiKey', e.target.value)} placeholder="sk-…" />
        </Field>
      </div>
    </Modal>
  );
}

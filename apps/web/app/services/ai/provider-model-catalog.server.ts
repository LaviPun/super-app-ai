import { getPrisma } from '~/db.server';

export type CatalogModel = {
  model: string;
  displayName: string;
  description: string | null;
  contextWindow: number | null;
  inputPer1MTokensCents: number;
  outputPer1MTokensCents: number;
  cachedInputPer1MTokensCents: number | null;
};

const PROVIDER_PREFIX: Record<'OPENAI' | 'ANTHROPIC', string> = {
  OPENAI: 'openai/',
  ANTHROPIC: 'anthropic/',
};

function toCentsPer1M(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  // OpenRouter prices are USD/token. Convert -> cents per 1M tokens.
  return Math.round(n * 100_000_000);
}

function normalizeModelId(provider: 'OPENAI' | 'ANTHROPIC', id: string): string | null {
  const prefix = PROVIDER_PREFIX[provider];
  if (!id.startsWith(prefix)) return null;
  return id.slice(prefix.length).trim() || null;
}

function uniqueByModel(rows: CatalogModel[]): CatalogModel[] {
  const out = new Map<string, CatalogModel>();
  for (const row of rows) {
    if (!out.has(row.model)) out.set(row.model, row);
  }
  return [...out.values()];
}

export async function fetchProviderCatalog(provider: 'OPENAI' | 'ANTHROPIC'): Promise<CatalogModel[]> {
  const resp = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) {
    throw new Error(`Catalog API failed with ${resp.status}`);
  }

  const payload = (await resp.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      description?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string; cached?: string };
    }>;
  };
  const data = Array.isArray(payload.data) ? payload.data : [];

  const rows: CatalogModel[] = [];
  for (const item of data) {
    const id = String(item.id ?? '').trim();
    const model = normalizeModelId(provider, id);
    if (!model) continue;
    const inputCents = toCentsPer1M(item.pricing?.prompt);
    const outputCents = toCentsPer1M(item.pricing?.completion);
    if (inputCents == null || outputCents == null) continue;
    rows.push({
      model,
      displayName: String(item.name ?? model),
      description: item.description ? String(item.description) : null,
      contextWindow: Number.isFinite(item.context_length) ? Number(item.context_length) : null,
      inputPer1MTokensCents: inputCents,
      outputPer1MTokensCents: outputCents,
      cachedInputPer1MTokensCents: toCentsPer1M(item.pricing?.cached),
    });
  }
  return uniqueByModel(rows);
}

function mergeProviderExtraConfig(existing: string | null, next: Record<string, unknown>): string {
  let parsed: Record<string, unknown> = {};
  if (existing) {
    try {
      parsed = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  return JSON.stringify({ ...parsed, ...next });
}

export async function syncProviderCatalogToDb(params: {
  providerId: string;
  providerKind: string;
}): Promise<{ syncedCount: number }> {
  const providerKind = params.providerKind === 'OPENAI' || params.providerKind === 'ANTHROPIC'
    ? params.providerKind
    : null;
  if (!providerKind) return { syncedCount: 0 };

  const models = await fetchProviderCatalog(providerKind);
  if (models.length === 0) return { syncedCount: 0 };

  const prisma = getPrisma();
  const provider = await prisma.aiProvider.findUnique({ where: { id: params.providerId } });
  if (!provider) throw new Error('Provider not found');
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.aiModelPrice.updateMany({
      where: { providerId: params.providerId, isActive: true },
      data: { isActive: false },
    });

    await tx.aiModelPrice.createMany({
      data: models.map((m) => ({
        providerId: params.providerId,
        model: m.model,
        inputPer1MTokensCents: m.inputPer1MTokensCents,
        outputPer1MTokensCents: m.outputPer1MTokensCents,
        cachedInputPer1MTokensCents: m.cachedInputPer1MTokensCents,
        isActive: true,
        effectiveFrom: now,
      })),
    });

    const modelInfo = models.map((m) => ({
      model: m.model,
      displayName: m.displayName,
      description: m.description,
      contextWindow: m.contextWindow,
    }));

    await tx.aiProvider.update({
      where: { id: params.providerId },
      data: {
        extraConfig: mergeProviderExtraConfig(provider.extraConfig, {
          modelCatalog: modelInfo,
          modelCatalogSyncedAt: now.toISOString(),
          modelCatalogSource: 'openrouter',
        }),
      },
    });
  });

  return { syncedCount: models.length };
}

export function getLatestProviderFeaturePreset(providerKind: string): Record<string, unknown> {
  if (providerKind === 'OPENAI') {
    return {
      apiPresetVersion: '2026-04',
      openaiFeatures: {
        reasoningEffort: 'medium',
        verbosity: 'medium',
        webSearch: false,
      },
    };
  }
  if (providerKind === 'ANTHROPIC') {
    return {
      apiPresetVersion: '2026-04',
      anthropicFeatures: {
        skills: [],
        codeExecution: false,
      },
    };
  }
  return {
    apiPresetVersion: '2026-04',
  };
}

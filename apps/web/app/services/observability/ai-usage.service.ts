import { getPrisma } from '~/db.server';
import { getRequestContext } from '~/services/observability/correlation.server';

/**
 * Records AI provider usage. Supports both DB-configured providers (with a row in
 * `AiProvider`) and env-only providers — for env-only, `providerId` is null and
 * we attach a synthetic provider row tagged `env:openai` / `env:anthropic` /
 * `env:custom` so quota counts and cost estimates still work.
 *
 * The `Prisma.AiUsage.providerId` column is required, so we lazily upsert one
 * synthetic provider row per env-source on first use.
 */
export class AiUsageService {
  async record(params: {
    providerId: string | null;
    shopId?: string;
    action: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    requestCount?: number;
    meta?: unknown;
    correlationId?: string;
    /**
     * Set when providerId is null. Identifies which env key was used so we can
     * group usage by source. Falls back to `env:unknown`.
     */
    envSource?: 'env:openai' | 'env:anthropic' | 'env:custom' | 'env:unknown';
  }) {
    const prisma = getPrisma();
    const providerId = params.providerId ?? (await ensureEnvProviderRow(params.envSource ?? 'env:unknown'));
    const ctx = getRequestContext();
    const correlationId = params.correlationId ?? ctx?.correlationId ?? ctx?.requestId ?? null;
    await prisma.aiUsage.create({
      data: {
        provider: { connect: { id: providerId } },
        shop: params.shopId ? { connect: { id: params.shopId } } : undefined,
        action: params.action,
        tokensIn: params.tokensIn,
        tokensOut: params.tokensOut,
        costCents: params.costCents,
        requestCount: params.requestCount ?? 1,
        meta: params.meta ? JSON.stringify(params.meta) : null,
        correlationId,
      },
    });
  }
}

/**
 * Lazy-create one synthetic AiProvider row per env source so we can satisfy the
 * required FK on AiUsage.providerId without surfacing it on the providers UI.
 * The synthetic row is marked inactive and stores no real API key.
 */
async function ensureEnvProviderRow(envSource: string): Promise<string> {
  const prisma = getPrisma();
  const name = envSource;
  const existing = await prisma.aiProvider.findFirst({ where: { name } });
  if (existing) return existing.id;
  const created = await prisma.aiProvider.create({
    data: {
      name,
      provider: providerKindFromEnvSource(envSource),
      apiKeyEnc: '',
      baseUrl: null,
      model: null,
      isActive: false,
    },
  });
  return created.id;
}

function providerKindFromEnvSource(envSource: string): 'OPENAI' | 'ANTHROPIC' | 'CUSTOM' {
  if (envSource === 'env:openai') return 'OPENAI';
  if (envSource === 'env:anthropic') return 'ANTHROPIC';
  return 'CUSTOM';
}

import { getPrisma } from '~/db.server';

type EstimateCostOptions = {
  providerId?: string | null;
  providerKinds?: string[];
  model: string;
  tokensIn: number;
  tokensOut: number;
};

/**
 * Models already warned about this process — an unpriced model can be hit on
 * every generation, so the unknown-price WARN below is emitted once per model
 * (per process) instead of flooding the logs.
 */
const warnedUnpricedModels = new Set<string>();

/**
 * Telemetry guard (2026-08 prod audit): a model with no `AiModelPrice` row
 * silently prices at 0, which masks real spend in every usage rollup. When
 * that happens on a call that actually consumed tokens, say so loudly (once
 * per model per process) so the missing row gets seeded instead of hiding.
 */
function warnUnpricedModel(model: string, options: EstimateCostOptions): void {
  if (options.tokensIn + options.tokensOut <= 0) return;
  const scope = options.providerId?.trim() || (options.providerKinds ?? []).join(',') || 'unscoped';
  const key = `${scope}/${model}`;
  if (warnedUnpricedModels.has(key)) return;
  warnedUnpricedModels.add(key);
  console.warn(
    `[ai-cost] no active AiModelPrice row for model "${model}" (provider scope: ${scope}); ` +
      `cost recorded as 0 despite ${options.tokensIn} in / ${options.tokensOut} out tokens. ` +
      `Seed pricing (pnpm --filter web seed:ai-pricing or the internal ai-providers admin) — ` +
      `until then this model's spend is invisible in usage rollups. (Warned once per model per process.)`,
  );
}

export async function estimateCostCentsFromDbRates(options: EstimateCostOptions): Promise<number> {
  const model = options.model?.trim();
  if (!model) return 0;

  const prisma = getPrisma();

  if (options.providerId && options.providerId.trim()) {
    const price = await prisma.aiModelPrice.findFirst({
      where: { providerId: options.providerId.trim(), model, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!price) warnUnpricedModel(model, options);
    return priceToCents(price, options.tokensIn, options.tokensOut);
  }

  if (!options.providerKinds || options.providerKinds.length === 0) {
    warnUnpricedModel(model, options);
    return 0;
  }

  // Prefer a price row attached to a currently routing-active provider of this kind.
  const activePrice = await prisma.aiModelPrice.findFirst({
    where: { model, isActive: true, provider: { provider: { in: options.providerKinds }, isActive: true } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (activePrice) return priceToCents(activePrice, options.tokensIn, options.tokensOut);

  // Fall back to ANY priced provider of this kind, active or not. `AiProvider.isActive`
  // gates routing selection, not pricing validity — an env-key call (no DB provider
  // routed it at all) can still be priced off a provider row that merely holds rates.
  const anyPrice = await prisma.aiModelPrice.findFirst({
    where: { model, isActive: true, provider: { provider: { in: options.providerKinds } } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!anyPrice) warnUnpricedModel(model, options);
  return priceToCents(anyPrice, options.tokensIn, options.tokensOut);
}

function priceToCents(
  price: { inputPer1MTokensCents: number; outputPer1MTokensCents: number } | null,
  tokensIn: number,
  tokensOut: number,
): number {
  if (!price) return 0;
  // Fractional cents are preserved (AiUsage.costCents is a Float). Rounding to
  // integer cents here would zero out cheap-model calls (< 1¢) and lose real
  // spend once summed across thousands of calls.
  const inCents = (tokensIn / 1_000_000) * price.inputPer1MTokensCents;
  const outCents = (tokensOut / 1_000_000) * price.outputPer1MTokensCents;
  return inCents + outCents;
}

export function providerKindsForAssistantBackend(backend: string): string[] {
  switch (backend) {
    case 'openai':
      return ['OPENAI'];
    case 'anthropic':
      return ['ANTHROPIC'];
    case 'qwen3':
      return ['CUSTOM', 'OPENAI'];
    case 'ollama':
      return ['CUSTOM'];
    case 'custom':
      return ['CUSTOM', 'OPENAI', 'ANTHROPIC', 'AZURE_OPENAI'];
    default:
      return ['CUSTOM', 'OPENAI', 'ANTHROPIC', 'AZURE_OPENAI'];
  }
}

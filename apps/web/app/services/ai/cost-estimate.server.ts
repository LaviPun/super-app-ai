import { getPrisma } from '~/db.server';

type EstimateCostOptions = {
  providerId?: string | null;
  providerKinds?: string[];
  model: string;
  tokensIn: number;
  tokensOut: number;
};

export async function estimateCostCentsFromDbRates(options: EstimateCostOptions): Promise<number> {
  const model = options.model?.trim();
  if (!model) return 0;

  const prisma = getPrisma();

  if (options.providerId && options.providerId.trim()) {
    const price = await prisma.aiModelPrice.findFirst({
      where: { providerId: options.providerId.trim(), model, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    return priceToCents(price, options.tokensIn, options.tokensOut);
  }

  if (!options.providerKinds || options.providerKinds.length === 0) return 0;

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

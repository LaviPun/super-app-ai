import { getPrisma } from '~/db.server';

/**
 * Blend weight for ranking providers by cost. Matches the measured production
 * call shape (~4,065 input / ~1,370 output tokens per RECIPE_GENERATION_OPTION
 * call — see AiUsage aggregates) so the ranking reflects how real generation
 * calls actually spend, not a naive input-only or output-only comparison.
 */
const INPUT_WEIGHT = 0.75;
const OUTPUT_WEIGHT = 0.25;

export interface CostRankedProvider {
  providerId: string;
  model: string;
  /** Blended cents-per-1M-tokens score; lower is cheaper. Ranking key only — not a real charge. */
  scoreCentsPer1M: number;
}

/**
 * Ranks currently active (`AiProvider.isActive: true`) providers cheapest-first
 * using each provider's active `AiModelPrice` row. A provider with no priced
 * model can't be cost-compared and is excluded — callers should fall back to
 * the legacy single-provider path when this returns an empty list (e.g. no
 * pricing has been configured yet).
 */
export async function getCostRankedActiveProviders(): Promise<CostRankedProvider[]> {
  const prisma = getPrisma();
  const providers = await prisma.aiProvider.findMany({ where: { isActive: true } });

  const ranked: CostRankedProvider[] = [];
  for (const provider of providers) {
    if (!provider.model) continue;
    const price = await prisma.aiModelPrice.findFirst({
      where: { providerId: provider.id, model: provider.model, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!price) continue;
    const scoreCentsPer1M = price.inputPer1MTokensCents * INPUT_WEIGHT + price.outputPer1MTokensCents * OUTPUT_WEIGHT;
    ranked.push({ providerId: provider.id, model: provider.model, scoreCentsPer1M });
  }

  ranked.sort((a, b) => a.scoreCentsPer1M - b.scoreCentsPer1M);
  return ranked;
}

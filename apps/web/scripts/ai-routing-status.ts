/**
 * Reports the live AI cost-routing state so an operator can CONFIRM go-live
 * precondition #2 (cheapest-first routing is active) without guessing.
 *
 * Prints, for the current DB:
 *  - every provider, whether it's active, its default model, and whether that
 *    model has a price row (unpriced active providers can't be cost-ranked);
 *  - the exact cheapest-first order `getLlmClient` will chain across;
 *  - a PASS/WARN verdict.
 *
 * Run: pnpm --filter web ai:routing-status
 */
import { getPrisma } from '../app/db.server';
import { getCostRankedActiveProviders } from '../app/services/ai/provider-cost-routing.server';

function money(centsPer1M: number): string {
  return '$' + (centsPer1M / 100).toFixed(2) + '/1M';
}

async function main() {
  const prisma = getPrisma();
  const providers = await prisma.aiProvider.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });

  // eslint-disable-next-line no-console
  console.log('\nAI providers:');
  const activeUnpriced: string[] = [];
  for (const p of providers) {
    const price = p.model
      ? await prisma.aiModelPrice.findFirst({
          where: { providerId: p.id, model: p.model, isActive: true },
          orderBy: { effectiveFrom: 'desc' },
        })
      : null;
    const priceLabel = price
      ? `${money(price.inputPer1MTokensCents)} in / ${money(price.outputPer1MTokensCents)} out`
      : p.model
        ? 'NO PRICE ROW'
        : 'no default model';
    if (p.isActive && !price) activeUnpriced.push(p.name);
    // eslint-disable-next-line no-console
    console.log(
      `  ${p.isActive ? '● active  ' : '○ inactive'}  ${p.name} (${p.provider}) — ${p.model ?? '—'} — ${priceLabel}`,
    );
  }

  const ranked = await getCostRankedActiveProviders();
  // eslint-disable-next-line no-console
  console.log('\nCost-routing order (cheapest first — what getLlmClient chains across):');
  if (ranked.length === 0) {
    // eslint-disable-next-line no-console
    console.log('  (none — no active provider has a priced default model)');
  } else {
    ranked.forEach((r: { model: string; scoreCentsPer1M: number }, i: number) => {
      // eslint-disable-next-line no-console
      console.log(`  ${i + 1}. ${r.model}  — blended score ${r.scoreCentsPer1M.toFixed(1)}¢/1M`);
    });
  }

  // eslint-disable-next-line no-console
  console.log('');
  if (ranked.length >= 1) {
    // eslint-disable-next-line no-console
    console.log(`PASS: cheapest-first routing is active; primary = ${ranked[0]!.model}.`);
  } else {
    // eslint-disable-next-line no-console
    console.log('WARN: routing will fall back to the single active provider / env keys until a priced provider is active.');
  }
  if (activeUnpriced.length) {
    // eslint-disable-next-line no-console
    console.log(`WARN: active but unpriced (excluded from ranking): ${activeUnpriced.join(', ')} — seed pricing for their default model.`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

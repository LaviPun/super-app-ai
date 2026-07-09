/**
 * Seeds AiProvider rows + AiModelPrice rates for OpenAI, Gemini, and Anthropic so
 * real per-call cost tracking and cost-based routing become live.
 *
 * Go-live precondition #1 (cost math): as soon as these AiModelPrice rows exist,
 * every AiUsage row prices correctly — including env-key deployments, since
 * `estimateCostCentsFromDbRates` falls back to pricing by provider *kind*.
 *
 * Go-live precondition #2 (cheap routing): each provider's DEFAULT model is set to
 * its cheapest capable model, so `getCostRankedActiveProviders` ranks the whole
 * fleet cheapest-first. Routing only engages for providers an operator ACTIVATES
 * (real API key + isActive), which is the one manual step this script can't do.
 *
 * Safe + idempotent:
 *  - Existing providers are never clobbered (API key, active state, and a
 *    deliberately-chosen default model are all left untouched) — only their price
 *    rows are ensured. Re-run freely.
 *  - New providers are created inactive with a placeholder key and a cheap default.
 *  - Prices upsert on a stable effectiveFrom epoch, so re-runs update in place
 *    instead of piling up duplicate active rows.
 *
 * Rates are cents per 1M tokens (matches AiModelPrice.{input,output}Per1MTokensCents).
 */
import { getPrisma } from '../app/db.server';
import { encryptJson } from '../app/services/security/crypto.server';

// Stable epoch so upserts land on the same row across re-runs.
const SEED_EFFECTIVE_FROM = new Date('2026-01-01T00:00:00.000Z');

type ModelRate = { model: string; input: number; output: number; cachedInput?: number | null };
type ProviderSeed = {
  name: string;
  provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC';
  baseUrl: string;
  /** Cheapest capable generation model — becomes the default, driving the routing rank. */
  defaultModel: string;
  models: ModelRate[];
};

const PROVIDERS: ProviderSeed[] = [
  {
    name: 'OpenAI (default)',
    provider: 'OPENAI',
    baseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-5-mini',
    models: [
      { model: 'gpt-5-mini', input: 25, output: 200, cachedInput: 2 },       // $0.25 / $2
      { model: 'gpt-5.2', input: 175, output: 1400, cachedInput: 17 },        // $1.75 / $14
      { model: 'gpt-5.2-pro', input: 2100, output: 16800 },                   // $21 / $168
    ],
  },
  {
    name: 'Gemini (default)',
    provider: 'GEMINI',
    baseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { model: 'gemini-2.5-flash-lite', input: 10, output: 40 },             // $0.10 / $0.40
      { model: 'gemini-2.5-flash', input: 30, output: 250 },                 // $0.30 / $2.50
    ],
  },
  {
    name: 'Anthropic (default)',
    provider: 'ANTHROPIC',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-4-5',
    models: [
      { model: 'claude-haiku-4-5', input: 100, output: 500 },                // $1 / $5
      { model: 'claude-sonnet-4-6', input: 300, output: 1500 },              // $3 / $15
      { model: 'claude-opus-4-6', input: 500, output: 2500 },                // $5 / $25
    ],
  },
];

async function main() {
  const prisma = getPrisma();

  for (const seed of PROVIDERS) {
    let row = await prisma.aiProvider.findFirst({ where: { name: seed.name } });
    let created = false;
    if (!row) {
      row = await prisma.aiProvider.create({
        data: {
          name: seed.name,
          provider: seed.provider,
          baseUrl: seed.baseUrl,
          model: seed.defaultModel,
          apiKeyEnc: encryptJson({ apiKey: 'SET_ME' }),
          isActive: false,
        },
      });
      created = true;
    }

    for (const m of seed.models) {
      await prisma.aiModelPrice.upsert({
        where: {
          providerId_model_effectiveFrom: {
            providerId: row.id,
            model: m.model,
            effectiveFrom: SEED_EFFECTIVE_FROM,
          },
        },
        create: {
          providerId: row.id,
          model: m.model,
          inputPer1MTokensCents: m.input,
          outputPer1MTokensCents: m.output,
          cachedInputPer1MTokensCents: m.cachedInput ?? null,
          effectiveFrom: SEED_EFFECTIVE_FROM,
          isActive: true,
        },
        update: {
          inputPer1MTokensCents: m.input,
          outputPer1MTokensCents: m.output,
          cachedInputPer1MTokensCents: m.cachedInput ?? null,
          isActive: true,
        },
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      `${created ? 'created' : 'exists '} ${seed.name} (${seed.provider}) — default ${created ? seed.defaultModel : row.model ?? '—'}, ${seed.models.length} price rows ensured`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    '\nPricing seeded. Cost tracking is now live for every call.\n' +
      'To activate cheapest-first routing: set a real API key and toggle isActive for each\n' +
      'provider in /internal/ai-providers, then run `pnpm --filter web ai:routing-status` to confirm.',
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

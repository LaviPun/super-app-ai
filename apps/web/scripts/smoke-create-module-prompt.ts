/**
 * Smoke test: COMPILE and PRINT the exact prompt the create-module route sends
 * to the AI — WITHOUT calling the AI (no API key) and WITHOUT touching the DB.
 *
 * It reproduces the deterministic pipeline from
 * `routes/api.ai.create-module.tsx` + `generateValidatedRecipeOptionsParallel`
 * (the path taken for types that have a per-type JSON schema, e.g.
 * `theme.section`): classify → intent packet → router decision → requirement
 * spec → grounding → compile single-recipe prompt(s).
 *
 * The real create call fires 3 parallel single-recipe generations, one per
 * APPROACH_HINT. The prompts are identical except for the "Approach:" line, so
 * we print Approach #1 in full and the differing line for #2/#3.
 *
 * Usage:
 *   pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json \
 *     scripts/smoke-create-module-prompt.ts "Create an exit-intent popup offering 10% off for new subscribers"
 *
 * Optional flags:
 *   --type <ModuleType>      force preferredType (default: Auto)
 *   --no-constraints         omit the representative "Constraints:" prefix
 *   --ref-url <url>          design reference URL (default: settings fallback → bummer.in)
 *   --all                    print all 3 approach prompts in full
 */

import type { ModuleType } from '@superapp/core';
import { MODULE_TYPE_TO_TEMPLATE_KIND } from '@superapp/core';
import { classifyUserIntent } from '~/services/ai/classify.server';
import { buildIntentPacket } from '~/services/ai/intent-packet.server';
import { serializeIntentPacketForPrompt, getRecipeTokenBudget } from '~/services/ai/token-budget.server';
import { extractRequirementSpec } from '~/services/ai/requirement-spec.server';
import { searchSolutions } from '~/services/ai/solution-search.server';
import { getModuleSummary } from '~/services/ai/module-summaries.server';
import { getRecipeSingleJsonSchemaForType } from '~/services/ai/recipe-json-schema.server';
import { getCatalogDetails } from '~/services/ai/catalog-details.server';
import {
  buildDesignReferencePromptBlock,
  buildDesignSystemDirectiveForReference,
  deriveDesignReferencePack,
} from '~/services/ai/design-reference.server';
import {
  PROMPT_PURPOSE_AND_GUIDANCE,
  UI_DESIGNER_REFINEMENT_PASS,
  FRONTEND_DEVELOPER_REFINEMENT_PASS,
  PREMIUM_OUTPUT_GUARDRAILS,
  getPromptExpectations,
  getSettingsPack,
  getFullRecipeSchemaSpec,
  getStorefrontStyleSchemaSpec,
} from '~/services/ai/prompt-expectations.server';
import { compileCreateSingleRecipePrompt, APPROACH_HINTS } from '~/services/ai/llm.server';

type Args = {
  prompt: string;
  preferredType: string;
  withConstraints: boolean;
  refUrl?: string;
  all: boolean;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    prompt: '',
    preferredType: 'Auto',
    withConstraints: true,
    refUrl: undefined,
    all: false,
    json: false,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--type') { out.preferredType = argv[++i] ?? 'Auto'; continue; }
    if (a === '--ref-url') { out.refUrl = argv[++i]; continue; }
    if (a === '--no-constraints') { out.withConstraints = false; continue; }
    if (a === '--all') { out.all = true; continue; }
    if (a === '--json') { out.json = true; continue; }
    positional.push(a);
  }
  out.prompt = positional.join(' ').trim()
    || 'Create an exit-intent popup offering 10% off for new email subscribers, with a clear CTA';
  return out;
}

/**
 * Deterministic router decision — exactly what production returns when the
 * internal AI router endpoint is NOT configured (the default). Mirrors
 * `buildDeterministicDecision` in prompt-router.server.ts.
 */
function deterministicRouterDecision(
  moduleType: ModuleType,
  intent: string | undefined,
  surface: string | undefined,
  confidence: number,
) {
  const isStorefront = moduleType.startsWith('theme.') || moduleType === 'proxy.widget';
  const catalogFilters = {
    templateKind: MODULE_TYPE_TO_TEMPLATE_KIND[moduleType],
    intent,
    surface,
    limit: 8,
  };
  if (confidence >= 0.8) {
    return {
      band: 'high (≥0.80)',
      catalogFilters,
      includeFlags: {
        includeSettingsPack: true,
        includeIntentPacket: false,
        includeCatalog: false,
        includeFullSchema: false,
        includeStyleSchema: false,
      },
    };
  }
  if (confidence >= 0.55) {
    return {
      band: 'medium (0.55–0.79)',
      catalogFilters,
      includeFlags: {
        includeSettingsPack: true,
        includeIntentPacket: true,
        includeCatalog: true,
        includeFullSchema: false,
        includeStyleSchema: false,
      },
    };
  }
  return {
    band: 'low (<0.55)',
    catalogFilters,
    includeFlags: {
      includeSettingsPack: true,
      includeIntentPacket: true,
      includeCatalog: true,
      includeFullSchema: true,
      includeStyleSchema: isStorefront,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // The route prepends a Constraints: block (plan tier, workspace module counts,
  // any preferred type/category) before classification + before the user request.
  // Those values are DB/Shopify-derived; here we show a representative block so
  // the prompt shape matches production. Disable with --no-constraints.
  let userRequest = args.prompt;
  if (args.withConstraints) {
    const constraints = [
      'Merchant plan tier: PRO. Only suggest module types the merchant can publish on this plan.',
      'Workspace: 0 module(s) total (0 published, 0 draft). Avoid names that are likely already in use.',
    ];
    userRequest = `Constraints: ${constraints.join(' ')}\n\nUser request: ${args.prompt}`;
  }

  // 1. Classify (keyword tier; embeddings auto-skip without OPENAI_API_KEY).
  const classification = await classifyUserIntent(userRequest, args.preferredType);
  // NOTE: the route also runs augmentWithcheapClassifier, but that only fires an
  // LLM call when confidence < 0.55. Skipped here (no API key); a clear prompt
  // classifies high-confidence via keywords anyway.

  // 2. Intent packet (pure).
  const intentPacket = buildIntentPacket(userRequest, classification, {
    storeContext: { shop_domain: 'smoke-local.myshopify.com', theme_os2: true },
  });
  const confidence = intentPacket.classification.confidence;
  const moduleType = classification.moduleType;

  // 3. Router decision (deterministic; no internal router endpoint configured).
  const router = deterministicRouterDecision(
    moduleType,
    classification.intent,
    classification.surface,
    confidence,
  );

  // 4. Requirement spec + grounding (pure, no extra LLM hop).
  const requirementSpec = await extractRequirementSpec({
    userRequest,
    classification,
    intentPacket,
  });
  const { startFrom, grounding } = searchSolutions(requirementSpec);

  // --- Replicate generateValidatedRecipeOptionsParallel's block selection ---
  const singleSchema = getRecipeSingleJsonSchemaForType(moduleType);
  const perBudget = getRecipeTokenBudget(moduleType);
  const storefrontTypes: ModuleType[] = ['theme.section', 'proxy.widget'];
  const isStorefront = storefrontTypes.includes(moduleType);

  const purposeAndGuidance = PROMPT_PURPOSE_AND_GUIDANCE;
  const summary = getModuleSummary(moduleType);
  const expectations = getPromptExpectations(moduleType, 'single');
  const settingsPack = router.includeFlags.includeSettingsPack === false
    ? undefined
    : getSettingsPack(moduleType);
  const fullSchemaSpec = !singleSchema && router.includeFlags.includeFullSchema
    ? getFullRecipeSchemaSpec(moduleType)
    : undefined;
  const styleSchemaSpec = router.includeFlags.includeStyleSchema && isStorefront
    ? getStorefrontStyleSchemaSpec()
    : undefined;
  const catalogDetails = router.includeFlags.includeCatalog
    ? getCatalogDetails({
        templateKind: router.catalogFilters.templateKind,
        intent: router.catalogFilters.intent,
        surface: router.catalogFilters.surface,
        limit: router.catalogFilters.limit,
      })
    : undefined;
  const intentPacketJson = router.includeFlags.includeIntentPacket === false
    ? undefined
    : serializeIntentPacketForPrompt(intentPacket);
  // Storefront design reference: route uses the live-theme palette when a theme
  // profile exists, else the settings URL / fallback pack. Here we use the
  // DB-free fallback pack (the production default when no theme is analyzed).
  const designReferencePack = isStorefront ? deriveDesignReferencePack(args.refUrl) : undefined;
  const designReferenceBlock = designReferencePack
    ? buildDesignReferencePromptBlock(designReferencePack)
    : undefined;
  const designSystemDirective = designReferencePack
    ? buildDesignSystemDirectiveForReference(designReferencePack)
    : undefined;
  const uiDesignerPass = isStorefront ? UI_DESIGNER_REFINEMENT_PASS : undefined;
  const frontendDeveloperPass = isStorefront ? FRONTEND_DEVELOPER_REFINEMENT_PASS : undefined;
  const premiumGuardrails = isStorefront ? PREMIUM_OUTPUT_GUARDRAILS : undefined;

  const compileFor = (approach: { label: string; hint: string }) =>
    compileCreateSingleRecipePrompt({
      purposeAndGuidance,
      moduleType,
      summary,
      expectations,
      userRequest,
      approachHint: approach.hint,
      approachLabel: approach.label,
      fullSchemaSpec,
      styleSchemaSpec,
      catalogDetails,
      groundingBlock: grounding || undefined,
      settingsPack,
      intentPacketJson,
      promptProfile: intentPacket.routing.prompt_profile,
      designReferenceBlock,
      designSystemDirective,
      uiDesignerPass,
      frontendDeveloperPass,
      premiumGuardrails,
    });

  const prompts = APPROACH_HINTS.map((a) => ({ label: a.label, hint: a.hint, text: compileFor(a) }));

  const metadata = {
    userPrompt: args.prompt,
    classifiedModuleType: moduleType,
    classifierConfidence: Number(confidence.toFixed(3)),
    confidenceBand: router.band,
    promptProfile: intentPacket.routing.prompt_profile,
    intent: intentPacket.classification.intent,
    surface: intentPacket.classification.surface,
    perCallMaxTokens: perBudget,
    hasPerTypeJsonSchema: Boolean(singleSchema),
    parallelCalls: prompts.length,
    blocksIncluded: {
      designReference: Boolean(designReferenceBlock),
      designSystemDirective: Boolean(designSystemDirective),
      settingsPack: Boolean(settingsPack),
      intentPacket: Boolean(intentPacketJson),
      catalog: Boolean(catalogDetails),
      fullSchema: Boolean(fullSchemaSpec),
      styleSchema: Boolean(styleSchemaSpec),
      grounding: Boolean(grounding),
    },
    requirementMustHaveControls: requirementSpec.mustHaveControls,
    startFromTemplates: startFrom.map((s) => s.templateId),
    promptChars: prompts[0]?.text.length ?? 0,
  };

  // Machine-readable bundle: metadata + every compiled approach prompt. Used to
  // feed the prompt to a model and to assemble a verifiable result file.
  if (args.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ metadata, prompts }, null, 2));
    return;
  }

  const rule = (label: string) => `\n${'='.repeat(80)}\n${label}\n${'='.repeat(80)}`;

  // eslint-disable-next-line no-console
  console.log(rule('CREATE-MODULE SMOKE — compiled prompt (NO AI call, NO DB)'));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(metadata, null, 2));

  if (args.all) {
    for (const p of prompts) {
      // eslint-disable-next-line no-console
      console.log(rule(`PROMPT — approach "${p.label}" (${p.text.length} chars)`));
      // eslint-disable-next-line no-console
      console.log(p.text);
    }
  } else {
    const first = prompts[0]!;
    // eslint-disable-next-line no-console
    console.log(rule(`PROMPT #1 of ${prompts.length} — approach "${first.label}" (${first.text.length} chars)`));
    // eslint-disable-next-line no-console
    console.log(first.text);
    // eslint-disable-next-line no-console
    console.log(rule('OTHER PARALLEL CALLS differ ONLY by this "Approach:" line'));
    for (const p of prompts.slice(1)) {
      // eslint-disable-next-line no-console
      console.log(`\n[${p.label}]\n${p.hint}`);
    }
  }
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

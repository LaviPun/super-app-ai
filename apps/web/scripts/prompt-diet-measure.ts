/**
 * Prompt-diet measurement harness (feat/prompt-diet).
 *
 * Compiles the REAL create-module prompt (fan-out single-recipe path — the path
 * every type takes now that all union branches have a per-type JSON Schema) and
 * the hydrate prompt for three representative cases, and prints a per-section
 * token breakdown (chars/4 estimate — no tokenizer dependency in this repo).
 *
 * Zero AI calls, zero DB. Mirrors the block selection in
 * `generateValidatedRecipeOptionsStream` (llm.server.ts) + the deterministic
 * router (`buildDeterministicDecision` in prompt-router.server.ts), the same way
 * `scripts/smoke-create-module-prompt.ts` does.
 *
 * Usage:
 *   pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json scripts/prompt-diet-measure.ts
 *   ... --json   machine-readable output
 */
/* eslint-disable no-console -- measurement harness prints its report to stdout */
import type { ModuleType, RecipeSpec } from '@superapp/core';
import { classifyUserIntent } from '~/services/ai/classify.server';
import { buildIntentPacket } from '~/services/ai/intent-packet.server';
import { serializeIntentPacketForPrompt, getRecipeTokenBudget } from '~/services/ai/token-budget.server';
import { extractRequirementSpec } from '~/services/ai/requirement-spec.server';
import { searchSolutions } from '~/services/ai/solution-search.server';
import { getModuleSummary } from '~/services/ai/module-summaries.server';
import { getRecipeSingleJsonSchemaForType } from '~/services/ai/recipe-json-schema.server';
import { getCatalogDetailsForType } from '~/services/ai/catalog-details.server';
import {
  buildDesignReferencePromptBlock,
  buildDesignSystemDirectiveForReference,
  paletteToDesignReferencePack,
} from '~/services/ai/design-reference.server';
import {
  getPurposeAndGuidance,
  STOREFRONT_QUALITY_PASS,
  getPromptExpectations,
  getSettingsPack,
  getStorefrontStyleSchemaSpec,
} from '~/services/ai/prompt-expectations.server';
import { getShopifyDocsBlock } from '~/services/ai/shopify-docs-grounding.server';
import { wrapUserRequestForPrompt } from '~/services/ai/injection-scan.server';
import { compileCreateSingleRecipePrompt, APPROACH_HINTS } from '~/services/ai/llm.server';
import { buildHydratePrompt } from '~/services/ai/hydrate-prompt.server';
import { CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';

const tok = (s: string | undefined): number => (s ? Math.round(s.length / 4) : 0);

type Row = { section: string; chars: number; tokens: number; where: 'prefix' | 'suffix' | '-' };

function printTable(title: string, rows: Row[], totals: { prompt: string; cacheableChars: number }) {
  const w1 = Math.max(...rows.map((r) => r.section.length), 28);
  console.log(`\n### ${title}`);
  console.log(`${'section'.padEnd(w1)} | ${'chars'.padStart(7)} | ${'~tokens'.padStart(7)} | zone`);
  console.log(`${'-'.repeat(w1)} | ${'-'.repeat(7)} | ${'-'.repeat(7)} | ----`);
  for (const r of rows.filter((r) => r.chars > 0)) {
    console.log(`${r.section.padEnd(w1)} | ${String(r.chars).padStart(7)} | ${String(r.tokens).padStart(7)} | ${r.where}`);
  }
  const sum = rows.reduce((a, r) => a + r.tokens, 0);
  console.log(`${'SUM of sections'.padEnd(w1)} | ${String(rows.reduce((a, r) => a + r.chars, 0)).padStart(7)} | ${String(sum).padStart(7)} |`);
  console.log(`${'COMPILED PROMPT TOTAL'.padEnd(w1)} | ${String(totals.prompt.length).padStart(7)} | ${String(tok(totals.prompt)).padStart(7)} | (prefix=${Math.round(totals.cacheableChars / 4)} tok / suffix=${Math.round((totals.prompt.length - totals.cacheableChars) / 4)} tok)`);
}

async function measureCreateCase(
  caseName: string,
  userPrompt: string,
  opts: { palette: boolean; preferredType?: string; forceBand?: 'high' | 'medium' | 'low' },
) {
  const constraints = [
    'Merchant plan tier: PRO. Only suggest module types the merchant can publish on this plan.',
  ];
  const userRequest = `Constraints: ${constraints.join(' ')}\n\nUser request: ${userPrompt}`;

  const classification = await classifyUserIntent(userRequest, opts.preferredType ?? 'Auto');
  const intentPacket = buildIntentPacket(userRequest, classification, {
    storeContext: { shop_domain: 'measure-local.myshopify.com', theme_os2: true },
  });
  const confidence = intentPacket.classification.confidence;
  const moduleType = classification.moduleType;
  // In production the embedding + cheap-classifier stages usually lift clear
  // prompts into the high band; the keyword tier alone under-scores. forceBand
  // lets each case measure the band production actually hits for that shape.
  const band = opts.forceBand ?? (confidence >= CONFIDENCE_THRESHOLDS.DIRECT ? 'high' : confidence < 0.55 ? 'low' : 'medium');
  const isHigh = band === 'high';
  const isLow = band === 'low';

  // Deterministic router bands (prompt-router.server.ts buildDeterministicDecision)
  const includeFlags = isHigh
    ? { settingsPack: true, intentPacket: false, catalog: false, fullSchema: false, styleSchema: false }
    : isLow
      ? { settingsPack: true, intentPacket: true, catalog: true, fullSchema: true, styleSchema: true }
      : { settingsPack: true, intentPacket: true, catalog: true, fullSchema: false, styleSchema: false };

  const requirementSpec = await extractRequirementSpec({ userRequest, classification, intentPacket });
  const { grounding, exemplar } = searchSolutions(requirementSpec);

  const storefrontTypes: ModuleType[] = ['theme.section', 'proxy.widget'];
  const isStorefront = storefrontTypes.includes(moduleType);
  const singleSchema = getRecipeSingleJsonSchemaForType(moduleType);

  const purposeAndGuidance = getPurposeAndGuidance(moduleType);
  const summary = getModuleSummary(moduleType);
  const expectations = getPromptExpectations(moduleType, 'single');
  const settingsPack = includeFlags.settingsPack ? getSettingsPack(moduleType) : undefined;
  const styleSchemaSpec = includeFlags.styleSchema && isStorefront ? getStorefrontStyleSchemaSpec() : undefined;
  const catalogDetails = includeFlags.catalog
    ? getCatalogDetailsForType(moduleType, classification.intent, classification.surface)
    : undefined;
  const intentPacketJson = includeFlags.intentPacket ? serializeIntentPacketForPrompt(intentPacket) : undefined;

  // "With palette": the live-theme extraction path (paletteToDesignReferencePack).
  const designReferencePack = isStorefront && opts.palette
    ? paletteToDesignReferencePack(
        {
          source: 'theme-settings',
          primary: '#1A1A2E',
          accent: '#E94560',
          button: '#E94560',
          background: '#FFFFFF',
          text: '#16161A',
          neutrals: ['#F5F5F7', '#8A8A93'],
        } as never,
        { headingFont: 'Playfair Display', bodyFont: 'Inter' } as never,
        'live-theme',
      )
    : undefined;
  const designReferenceBlock = designReferencePack ? buildDesignReferencePromptBlock(designReferencePack) : undefined;
  const designSystemDirective = designReferencePack ? buildDesignSystemDirectiveForReference(designReferencePack) : undefined;
  const uiDesignerPass = isStorefront ? STOREFRONT_QUALITY_PASS : undefined;
  const exemplarBlock = exemplar?.specJson
    ? `Hand-authored production-quality example of this module type (match its completeness, structure, and level of polish — do NOT copy its copy-text, name, or brand-specific content verbatim; adapt fully to the user's request):\n${exemplar.specJson}`
    : undefined;
  const platformBlock = getShopifyDocsBlock(moduleType);
  const approach = APPROACH_HINTS[0]!;
  const wrappedUserRequest = wrapUserRequestForPrompt(userRequest);

  const compiled = compileCreateSingleRecipePrompt({
    purposeAndGuidance,
    moduleType,
    summary,
    expectations,
    userRequest,
    approachHint: approach.hint,
    approachLabel: approach.label,
    fullSchemaSpec: undefined, // every type has a per-type JSON schema → prose full schema never sent
    styleSchemaSpec,
    catalogDetails,
    exemplarBlock,
    groundingBlock: grounding || undefined,
    platformBlock,
    settingsPack,
    intentPacketJson,
    promptProfile: intentPacket.routing.prompt_profile,
    designReferenceBlock,
    designSystemDirective,
    uiDesignerPass,
  });

  const rows: Row[] = [
    { section: 'purposeAndGuidance', chars: purposeAndGuidance.length, tokens: tok(purposeAndGuidance), where: 'prefix' },
    { section: 'task+recommended-type lines', chars: 160, tokens: 40, where: 'prefix' },
    { section: 'moduleSummary', chars: summary.length, tokens: tok(summary), where: 'prefix' },
    { section: 'expectations (shape+rules+format)', chars: expectations.length, tokens: tok(expectations), where: 'prefix' },
    { section: 'profileGuidance', chars: 0, tokens: 0, where: 'prefix' },
    { section: 'qualityPass (was UI/FE/premium trio)', chars: uiDesignerPass?.length ?? 0, tokens: tok(uiDesignerPass), where: 'prefix' },
    { section: 'settingsPack', chars: settingsPack?.length ?? 0, tokens: tok(settingsPack), where: 'prefix' },
    { section: 'styleSchemaSpec', chars: styleSchemaSpec?.length ?? 0, tokens: tok(styleSchemaSpec), where: 'prefix' },
    { section: 'platformBlock (Shopify docs)', chars: platformBlock?.length ?? 0, tokens: tok(platformBlock), where: 'prefix' },
    { section: 'designReferenceBlock', chars: designReferenceBlock?.length ?? 0, tokens: tok(designReferenceBlock), where: 'suffix' },
    { section: 'designSystemDirective', chars: designSystemDirective?.length ?? 0, tokens: tok(designSystemDirective), where: 'suffix' },
    { section: 'approachHint', chars: approach.hint.length, tokens: tok(approach.hint), where: 'suffix' },
    { section: 'userRequest (wrapped, incl envelope)', chars: wrappedUserRequest.length, tokens: tok(wrappedUserRequest), where: 'suffix' },
    { section: 'intentPacketJson', chars: intentPacketJson?.length ?? 0, tokens: tok(intentPacketJson), where: 'suffix' },
    { section: 'catalogDetails', chars: catalogDetails?.length ?? 0, tokens: tok(catalogDetails), where: 'suffix' },
    { section: 'exemplarBlock (RAG few-shot)', chars: exemplarBlock?.length ?? 0, tokens: tok(exemplarBlock), where: 'suffix' },
    { section: 'groundingBlock (RAG hints)', chars: grounding?.length ?? 0, tokens: tok(grounding), where: 'suffix' },
  ];

  printTable(
    `${caseName} — type=${moduleType} conf=${confidence.toFixed(2)} band=${band} structuredSchema=${Boolean(singleSchema)} maxOut=${getRecipeTokenBudget(moduleType)}`,
    rows,
    compiled,
  );
  console.log(`NOTE: fan-out sends ~${APPROACH_HINTS.length}x this prompt per merchant generate (one per approach; only approachHint differs).`);
  return { moduleType, compiled, rows };
}

function measureHydrateCase() {
  const spec: RecipeSpec = {
    type: 'theme.section',
    name: 'Exit-Intent 10% Off Popup',
    category: 'STOREFRONT_UI',
    requires: ['THEME_ASSETS'],
    config: {
      kind: 'popup',
      activation: 'overlay',
      title: 'Wait — take 10% off',
      fields: { heading: 'Get 10% off your first order', body: 'Join the list and save on your first purchase.', ctaText: 'Claim my 10%' },
      fieldSchema: { fields: [{ name: 'heading', type: 'text', required: true }, { name: 'ctaText', type: 'text', required: false }] },
      blocks: [],
      trigger: 'ON_EXIT_INTENT',
      frequency: 'ONCE_PER_SESSION',
      showCloseButton: true,
    },
    style: { colors: { seed: '#E94560' }, layout: { mode: 'overlay', anchor: 'center' } },
  } as unknown as RecipeSpec;

  const compiled = buildHydratePrompt(spec, { planTier: 'GROWTH', locale: 'en' });
  const specJson = JSON.stringify(spec);
  const instructions = compiled.prompt.slice(0, compiled.cacheableChars);
  const rows: Row[] = [
    { section: 'stable instructions (envelope contract)', chars: instructions.length, tokens: tok(instructions), where: 'prefix' },
    { section: 'context line + RecipeSpec JSON + tail', chars: compiled.prompt.length - instructions.length, tokens: tok(compiled.prompt.slice(compiled.cacheableChars)), where: 'suffix' },
    { section: '  of which RecipeSpec JSON', chars: specJson.length, tokens: tok(specJson), where: 'suffix' },
  ];
  printTable('Case C: hydrate (theme.section popup, GROWTH/en)', rows.slice(0, 2), compiled);
  console.log(`  (RecipeSpec JSON alone: ${specJson.length} chars / ~${tok(specJson)} tok — grows with the recipe)`);
  return { compiled };
}

async function main() {
  console.log('Prompt-diet measurement — tokens are chars/4 estimates.');
  await measureCreateCase(
    'Case A: storefront theme.section + palette (high-confidence band)',
    'Create an exit-intent popup offering 10% off for new email subscribers, with a clear CTA',
    { palette: true, forceBand: 'high' },
  );
  await measureCreateCase(
    'Case A2: same request, low-confidence band (adds styleSchema/catalog/intentPacket)',
    'Create an exit-intent popup offering 10% off for new email subscribers, with a clear CTA',
    { palette: true, forceBand: 'low' },
  );
  await measureCreateCase(
    'Case B: function type (discount rules, merchant pinned type)',
    'Give VIP-tagged customers 15% off automatically when their order subtotal is over $100',
    { palette: false, preferredType: 'functions.discountRules', forceBand: 'high' },
  );
  measureHydrateCase();
}

main().catch((err) => {
  console.error('MEASURE FAILED:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

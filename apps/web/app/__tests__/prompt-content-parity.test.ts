import { describe, expect, it } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { wrapUserRequestForPrompt } from '~/services/ai/injection-scan.server';
import { compileCreateModulePrompt, compileCreateSingleRecipePrompt } from '~/services/ai/llm.server';
import { buildHydratePrompt } from '~/services/ai/hydrate-prompt.server';

/**
 * Prompt-content parity test (review finding 2 / crux D, fix round 1).
 *
 * The `old*` functions below (`oldCompileCreateModulePrompt`,
 * `oldCompileCreateSingleRecipePrompt`, `oldBuildHydratePrompt`, plus their
 * old-only helper deps `REQUIRED_GROUPS`/`ENVELOPE_GROUPS`/`getTypeSpecificGuidance`)
 * are extracted VERBATIM from git base 2250d58 —
 * `git show 2250d58:apps/web/app/services/ai/llm.server.ts` (lines 684-783,
 * 939-1025) and `git show 2250d58:apps/web/app/services/ai/hydrate-prompt.server.ts`
 * (lines 7-54) — renamed with an `old` prefix, otherwise byte-for-byte
 * unmodified. They are FROZEN fixtures, not a live re-implementation: do NOT
 * edit them to make a failing test pass. If the current prompt-builders'
 * content legitimately changes, re-extract a fresh frozen snapshot from the
 * relevant base commit instead of hand-editing this one — that would make
 * the parity check vacuous.
 *
 * The parity assertions below prove that splitting the current builders into
 * { prompt, cacheableChars } (stable prefix + dynamic suffix) did not add,
 * drop, or duplicate any content relative to the pre-split single-string
 * prompt: for a representative fully-populated input, they compare the
 * SORTED multiset of whitespace-delimited words between the old and new
 * outputs. A word-level (not line-level) multiset is required because one
 * legitimate restructuring in this batch — buildHydratePrompt separating the
 * "Convert RecipeSpec..." instruction from the "Context: plan=X, locale=Y"
 * line, which the old code joined into a single string via `+` before
 * ever pushing it — changes line boundaries without changing content. A
 * word multiset catches any real drop/duplication/mutation while staying
 * tolerant of exactly the reordering and re-joining this batch performs.
 *
 * Note on the plan text: the plan's Global Constraints (line 24 of
 * docs/superpowers/plans/2026-08-28-p2-a-generation-context.md) state
 * "`CompiledPrompt.prompt` stays byte-identical to today's flat-string
 * output" for any non-caching caller — but that specific sub-claim is not
 * literally satisfiable alongside the plan's own Architecture section
 * (line 7), which mandates reordering the prompt into a stable prefix +
 * dynamic suffix for EVERY caller, Anthropic or not. Reordering necessarily
 * changes the byte sequence. This was adjudicated (final whole-branch
 * review, finding 1) as: content parity is what's actually required and
 * guaranteed — semantic/word-multiset identity, proven here — not byte
 * identity, which no implementation of the mandated split could achieve.
 */
function sortedWords(s: string): string[] {
  return s.split(/\s+/).filter((w) => w.length > 0).sort();
}

// ---------------------------------------------------------------------------
// FROZEN fixtures extracted verbatim from git base 2250d58. Do not edit these
// to make a failing test pass — see the doc comment above.
// ---------------------------------------------------------------------------

/**
 * Old-only stand-in: PROFILE_GUIDANCE was an unexported constant in the base
 * commit's llm.server.ts. The representative fixtures below never set
 * `promptProfile`, so this is never actually indexed at runtime — it exists
 * only so the frozen function bodies below type-check unmodified.
 */
const PROFILE_GUIDANCE: Record<string, string> = {};

function oldCompileCreateModulePrompt(params: {
  purposeAndGuidance: string;
  typesList: string;
  moduleType: string;
  summary: string;
  expectations: string;
  userRequest: string;
  fullSchemaSpec?: string;
  styleSchemaSpec?: string;
  catalogDetails?: string;
  /** Tier-2 few-shot exemplar block (RAG) — already self-headed. Precedes grounding. */
  exemplarBlock?: string;
  /** Search-augmented grounding examples (RAG) — already self-headed. */
  groundingBlock?: string;
  /** Current Shopify platform constraints for this module family (self-headed). */
  platformBlock?: string;
  settingsPack?: string;
  previousError?: string;
  /** IntentPacket JSON (doc 15.8): structured intent so heavy AI only fills layout/copy/settings. */
  intentPacketJson?: string;
  /** Prompt profile from ROUTING_TABLE (e.g. storefront_ui_v1). Drives surface-specific guidance. */
  promptProfile?: string;
  designReferenceBlock?: string;
  designSystemDirective?: string;
  blueprintContext?: string;
  uiDesignerPass?: string;
  frontendDeveloperPass?: string;
  premiumGuardrails?: string;
  /** WS-builder-ux: merchant-chosen concept count (1-3, default 3). */
  optionCount?: number;
}): string {
  const profileGuidance = params.promptProfile ? PROFILE_GUIDANCE[params.promptProfile] : undefined;
  const optionCount = Math.max(1, Math.min(3, params.optionCount ?? 3));
  const optionCountWord = optionCount === 1 ? 'one' : optionCount === 2 ? 'two' : 'three';

  const parts: string[] = [];
  if (params.designReferenceBlock) {
    parts.push(params.designReferenceBlock, '');
  }
  if (params.designSystemDirective) {
    parts.push(params.designSystemDirective, '');
  }
  if (params.blueprintContext) {
    parts.push(params.blueprintContext, '');
  }
  parts.push(
    params.purposeAndGuidance,
    '',
    `Task: Generate exactly ${optionCountWord} (${optionCount}) different module option${optionCount === 1 ? '' : 's'} for the merchant's request.${optionCount > 1 ? ' Vary by approach (content, trigger, when/where it shows, or styling).' : ''}`,
    '',
    params.typesList,
    '',
    `Recommended type for this request: ${params.moduleType}`,
    params.summary,
    '',
    params.expectations,
    '',
    wrapUserRequestForPrompt(params.userRequest),
  );
  if (profileGuidance) {
    parts.push('', profileGuidance);
  }
  if (params.uiDesignerPass) {
    parts.push('', params.uiDesignerPass);
  }
  if (params.frontendDeveloperPass) {
    parts.push('', params.frontendDeveloperPass);
  }
  if (params.premiumGuardrails) {
    parts.push('', params.premiumGuardrails);
  }
  if (params.settingsPack) {
    parts.push('', params.settingsPack);
  }
  if (params.intentPacketJson) {
    parts.push('', 'PromptIntentSeedV1 (compact intent+routing context; do not change it):', params.intentPacketJson);
  }
  if (params.fullSchemaSpec) {
    parts.push('', 'Full recipe schema (Zod validation — every field must match):', params.fullSchemaSpec);
  }
  if (params.styleSchemaSpec) {
    parts.push('', 'Style schema (storefront only):', params.styleSchemaSpec);
  }
  if (params.catalogDetails) {
    parts.push('', 'Catalog (examples for inspiration):', params.catalogDetails);
  }
  if (params.exemplarBlock) {
    parts.push('', params.exemplarBlock);
  }
  if (params.groundingBlock) {
    parts.push('', params.groundingBlock);
  }
  if (params.platformBlock) {
    parts.push('', params.platformBlock);
  }
  if (params.previousError) {
    parts.push('', '(Previous validation error — fix in next response):', params.previousError);
  }
  return parts.join('\n');
}

function oldCompileCreateSingleRecipePrompt(params: {
  purposeAndGuidance: string;
  moduleType: string;
  summary: string;
  expectations: string;
  userRequest: string;
  approachHint?: string;
  approachLabel?: string;
  fullSchemaSpec?: string;
  styleSchemaSpec?: string;
  catalogDetails?: string;
  /** Tier-2 few-shot exemplar block (RAG) — already self-headed. Precedes grounding. */
  exemplarBlock?: string;
  /** Search-augmented grounding examples (RAG) — already self-headed. */
  groundingBlock?: string;
  /** Current Shopify platform constraints for this module family (self-headed). */
  platformBlock?: string;
  settingsPack?: string;
  previousError?: string;
  intentPacketJson?: string;
  promptProfile?: string;
  designReferenceBlock?: string;
  designSystemDirective?: string;
  blueprintContext?: string;
  uiDesignerPass?: string;
  frontendDeveloperPass?: string;
  premiumGuardrails?: string;
}): string {
  const profileGuidance = params.promptProfile ? PROFILE_GUIDANCE[params.promptProfile] : undefined;
  const parts: string[] = [];
  if (params.designReferenceBlock) {
    parts.push(params.designReferenceBlock, '');
  }
  if (params.designSystemDirective) {
    parts.push(params.designSystemDirective, '');
  }
  if (params.blueprintContext) {
    parts.push(params.blueprintContext, '');
  }
  parts.push(
    params.purposeAndGuidance,
    '',
    `Task: Generate exactly 1 module of type "${params.moduleType}" for the merchant's request. Output a JSON object: { "explanation": "1-2 sentences", "recipe": { ...one full RecipeSpec... } }.`,
  );
  if (params.approachHint) {
    parts.push('', params.approachHint);
  }
  parts.push(
    '',
    `Recommended type for this request: ${params.moduleType}`,
    params.summary,
    '',
    params.expectations,
    '',
    wrapUserRequestForPrompt(params.userRequest),
  );
  if (profileGuidance) parts.push('', profileGuidance);
  if (params.uiDesignerPass) parts.push('', params.uiDesignerPass);
  if (params.frontendDeveloperPass) parts.push('', params.frontendDeveloperPass);
  if (params.premiumGuardrails) parts.push('', params.premiumGuardrails);
  if (params.settingsPack) parts.push('', params.settingsPack);
  if (params.intentPacketJson) {
    parts.push('', 'PromptIntentSeedV1 (compact intent+routing context; do not change it):', params.intentPacketJson);
  }
  if (params.fullSchemaSpec) {
    parts.push('', 'Full recipe schema (Zod validation — every field must match):', params.fullSchemaSpec);
  }
  if (params.styleSchemaSpec) {
    parts.push('', 'Style schema (storefront only):', params.styleSchemaSpec);
  }
  if (params.catalogDetails) {
    parts.push('', 'Catalog (examples for inspiration):', params.catalogDetails);
  }
  if (params.exemplarBlock) {
    parts.push('', params.exemplarBlock);
  }
  if (params.groundingBlock) {
    parts.push('', params.groundingBlock);
  }
  if (params.platformBlock) {
    parts.push('', params.platformBlock);
  }
  if (params.previousError) {
    parts.push('', '(Previous validation error — fix in next response):', params.previousError);
  }
  return parts.join('\n');
}

/** Compact group list to reduce prompt tokens; full semantics in schema. */
const REQUIRED_GROUPS = 'content, layout, style, behavior, animation, visibility_targeting, rules_scheduling, localization, accessibility, performance, analytics';
const ENVELOPE_GROUPS =
  `adminConfig RULES — BOTH of these are REQUIRED:\n` +
  `1. adminConfig.jsonSchema.properties MUST include ALL 11 groups as top-level keys: ${REQUIRED_GROUPS}.\n` +
  `2. adminConfig.defaults MUST include ALL 11 groups as top-level keys (same names) with REAL, non-empty objects containing meaningful field defaults — NOT empty {} objects. Every group key in jsonSchema must have a corresponding populated defaults entry.`;

function getTypeSpecificGuidance(spec: RecipeSpec): string {
  if (spec.type === 'theme.section') {
    const kind = (spec.config as { kind?: string }).kind;
    if (kind === 'contactForm') {
      return ' Contact form: include field-visibility and required toggles, consent/privacy controls, anti-spam defaults (honeypot), and submission routing (SHOPIFY_CONTACT vs APP_PROXY) with endpoint fallback.';
    }
    return ' Section: structured fields/blocks first; custom HTML/CSS/JS only when needed; declare a clear kind. Overlay/popup kinds: add mobile fallback trigger; behavior: focus trap, escape-to-close, scroll lock, return focus; style: CTA bg/text/hover/focus.';
  }
  return '';
}


function oldBuildHydratePrompt(recipeSpec: RecipeSpec, merchantContext?: { planTier?: string; locale?: string }): string {
  const planTier = merchantContext?.planTier ?? 'STANDARD';
  const locale = merchantContext?.locale ?? 'en';

  const parts: string[] = [
    'Convert RecipeSpec → HydrateEnvelopeV1 (single JSON). Context: plan=' + planTier + ', locale=' + locale + '. Advanced toggles only for GROWTH+.',
    'Envelope version MUST be exactly "1.0".',
    'Rules: JSON only, no markdown.',

    // ── surfacePlan ── must be an OBJECT, not an array
    'surfacePlan: OBJECT (NOT array). Shape: { selectedSurfaces?: string[], compatibility?: [{ surface: string, status: "SUPPORTED"|"LIMITED"|"NOT_SUPPORTED", notes?: string[] }] }',

    // ── themeEditorSettings ──
    'themeEditorSettings.fields: array of OBJECTS. Each item MUST have "id" (string) and "label" (string). Shape: { id: string, type: string, label: string, default?: any, options?: [{ value: string, label: string }] }. options items MUST be objects {value,label} — NOT plain strings.',

    // ── uiTokens ──
    'uiTokens: each category (colors, typography, spacing, radius, shadow) is an ARRAY of token objects. Shape: [{ token: string, default: string|number, themeAware?: boolean }]. Example: colors:[{ token:"--color-text", default:"#111" }]. Do NOT output a plain object.',

    // ── validationReport ──
    'validationReport.overall: "PASS" or "WARN" only. validationReport.checks: array of { id: string, severity: "blocker"|"high"|"medium"|"low", status: "PASS"|"WARN"|"FAIL", description: string, howToFix?: string }. ALL four fields (id, severity, status, description) are required on every check.',

    // ── adminConfig ──
    ENVELOPE_GROUPS + getTypeSpecificGuidance(recipeSpec),

    'RecipeSpec:',
    JSON.stringify(recipeSpec),
    'Output ONLY the JSON object.',
  ];
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Parity assertions: new output vs. the frozen old fixtures, for
// representative fully-populated inputs.
// ---------------------------------------------------------------------------

describe('prompt-content parity: old (base 2250d58) vs. new (stable/dynamic split)', () => {
  it('compileCreateModulePrompt: same word multiset for a storefront moduleType with palette + optionCount', () => {
    const params = {
      purposeAndGuidance: 'PURPOSE_AND_GUIDANCE_BLOCK text goes here.',
      typesList: 'TYPES_LIST_BLOCK enumerating every module type.',
      moduleType: 'theme.section',
      summary: 'SUMMARY_BLOCK describing this module type.',
      expectations: 'EXPECTATIONS_BLOCK listing required fields.',
      userRequest: 'Add a countdown banner in our brand colors',
      fullSchemaSpec: 'FULL_SCHEMA_SPEC_BLOCK zod shape here.',
      styleSchemaSpec: 'STYLE_SCHEMA_SPEC_BLOCK storefront style shape.',
      catalogDetails: 'CATALOG_DETAILS_BLOCK example products.',
      exemplarBlock: 'EXEMPLAR_BLOCK hand-authored example.',
      groundingBlock: 'GROUNDING_BLOCK search-augmented examples.',
      platformBlock: 'PLATFORM_BLOCK shopify platform constraints.',
      settingsPack: 'SETTINGS_PACK_BLOCK admin config defaults.',
      previousError: 'PREVIOUS_ERROR_BLOCK zod validation failed here.',
      intentPacketJson: '{"intent":"INTENT_PACKET_BLOCK"}',
      designReferenceBlock: 'DESIGN_REFERENCE_PALETTE_BLOCK #111 #fff #0a5.',
      designSystemDirective: 'DESIGN_SYSTEM_DIRECTIVE_BLOCK match the palette.',
      blueprintContext: 'BLUEPRINT_CONTEXT_BLOCK sibling modules in this set.',
      uiDesignerPass: 'UI_DESIGNER_PASS_BLOCK refine visual hierarchy.',
      frontendDeveloperPass: 'FRONTEND_DEVELOPER_PASS_BLOCK refine markup.',
      premiumGuardrails: 'PREMIUM_GUARDRAILS_BLOCK no cheap-looking output.',
      optionCount: 2,
    };
    const oldPrompt = oldCompileCreateModulePrompt(params);
    const { prompt: newPrompt } = compileCreateModulePrompt(params);
    expect(sortedWords(newPrompt)).toEqual(sortedWords(oldPrompt));
  });

  it('compileCreateSingleRecipePrompt: same word multiset for a fully-populated fan-out option call', () => {
    const params = {
      purposeAndGuidance: 'PURPOSE_AND_GUIDANCE_BLOCK text goes here.',
      moduleType: 'theme.section',
      summary: 'SUMMARY_BLOCK describing this module type.',
      expectations: 'EXPECTATIONS_BLOCK listing required fields.',
      userRequest: 'Add a countdown banner in our brand colors',
      approachHint: 'APPROACH_HINT_BLOCK prioritize trust and clarity.',
      approachLabel: 'Conservative',
      fullSchemaSpec: 'FULL_SCHEMA_SPEC_BLOCK zod shape here.',
      styleSchemaSpec: 'STYLE_SCHEMA_SPEC_BLOCK storefront style shape.',
      catalogDetails: 'CATALOG_DETAILS_BLOCK example products.',
      exemplarBlock: 'EXEMPLAR_BLOCK hand-authored example.',
      groundingBlock: 'GROUNDING_BLOCK search-augmented examples.',
      platformBlock: 'PLATFORM_BLOCK shopify platform constraints.',
      settingsPack: 'SETTINGS_PACK_BLOCK admin config defaults.',
      previousError: 'PREVIOUS_ERROR_BLOCK zod validation failed here.',
      intentPacketJson: '{"intent":"INTENT_PACKET_BLOCK"}',
      designReferenceBlock: 'DESIGN_REFERENCE_PALETTE_BLOCK #111 #fff #0a5.',
      designSystemDirective: 'DESIGN_SYSTEM_DIRECTIVE_BLOCK match the palette.',
      blueprintContext: 'BLUEPRINT_CONTEXT_BLOCK sibling modules in this set.',
      uiDesignerPass: 'UI_DESIGNER_PASS_BLOCK refine visual hierarchy.',
      frontendDeveloperPass: 'FRONTEND_DEVELOPER_PASS_BLOCK refine markup.',
      premiumGuardrails: 'PREMIUM_GUARDRAILS_BLOCK no cheap-looking output.',
    };
    const oldPrompt = oldCompileCreateSingleRecipePrompt(params);
    const { prompt: newPrompt } = compileCreateSingleRecipePrompt(params);
    expect(sortedWords(newPrompt)).toEqual(sortedWords(oldPrompt));
  });

  it('buildHydratePrompt: same word multiset for a representative hydrate call (RecipeSpec + planTier/locale)', () => {
    const spec = {
      type: 'theme.section',
      name: 'Countdown Banner',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'banner',
        activation: 'section',
        fields: { heading: 'Sale ends soon', ctaText: 'Shop now' },
        blocks: [],
      },
    } as unknown as RecipeSpec;
    const oldPrompt = oldBuildHydratePrompt(spec, { planTier: 'GROWTH', locale: 'fr' });
    const { prompt: newPrompt } = buildHydratePrompt(spec, { planTier: 'GROWTH', locale: 'fr' });
    expect(sortedWords(newPrompt)).toEqual(sortedWords(oldPrompt));
  });
});

// ---------------------------------------------------------------------------
// Degenerate hasMeaningfulStatic=false path (review finding 2/D): the
// reviewer flagged that when purposeAndGuidance/fullSchemaSpec/settingsPack/
// summary are all empty, the pre-fix implementation silently DROPPED the
// unconditionally-built stable content (typesList, "Recommended type...",
// task text) from `prompt` entirely, instead of just marking it as not worth
// a cache breakpoint. Fixed in llm.server.ts (fix round 1): `cacheableChars`
// still reports 0 in this case, but `prompt` always contains full content.
// ---------------------------------------------------------------------------

describe('degenerate hasMeaningfulStatic=false path must not drop content', () => {
  it('compileCreateModulePrompt still includes typesList/"Recommended type"/expectations when purposeAndGuidance, fullSchemaSpec, settingsPack, and summary are all empty', () => {
    const { prompt, cacheableChars } = compileCreateModulePrompt({
      purposeAndGuidance: '',
      typesList: 'TYPES_LIST_MUST_SURVIVE',
      moduleType: 'theme.section',
      summary: '',
      expectations: 'EXPECTATIONS_MUST_SURVIVE',
      userRequest: 'x',
    });
    // Still correctly reports "not worth a cache breakpoint"...
    expect(cacheableChars).toBe(0);
    // ...but the content itself must never be silently dropped.
    expect(prompt).toContain('TYPES_LIST_MUST_SURVIVE');
    expect(prompt).toContain('EXPECTATIONS_MUST_SURVIVE');
    expect(prompt).toContain('Recommended type for this request: theme.section');
    expect(prompt).toContain('Task: Generate exactly');
  });

  it('compileCreateSingleRecipePrompt still includes the task text/"Recommended type"/expectations in the same degenerate case', () => {
    const { prompt, cacheableChars } = compileCreateSingleRecipePrompt({
      purposeAndGuidance: '',
      moduleType: 'theme.section',
      summary: '',
      expectations: 'EXPECTATIONS_MUST_SURVIVE_2',
      userRequest: 'x',
    });
    expect(cacheableChars).toBe(0);
    expect(prompt).toContain('Task: Generate exactly 1 module of type "theme.section"');
    expect(prompt).toContain('EXPECTATIONS_MUST_SURVIVE_2');
    expect(prompt).toContain('Recommended type for this request: theme.section');
  });
});

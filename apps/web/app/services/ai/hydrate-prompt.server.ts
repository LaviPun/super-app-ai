/**
 * Prompt builder for the hydrate step: given a RecipeSpec, produce a full
 * config envelope. Token-optimized to stay within provider rate limits (e.g. 10k input/min).
 */
import type { RecipeSpec } from '@superapp/core';
import type { CompiledPrompt } from '~/services/ai/llm.server';

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

export function buildHydratePrompt(recipeSpec: RecipeSpec, merchantContext?: { planTier?: string; locale?: string }): CompiledPrompt {
  const planTier = merchantContext?.planTier ?? 'STANDARD';
  const locale = merchantContext?.locale ?? 'en';

  // STABLE PREFIX: fixed shape instructions, deterministic given only
  // (recipeSpec.type, recipeSpec.config.kind) — shared across every merchant
  // hydrating a recipe of this (type, kind), and across plan tiers/locales too
  // (those move to the end of the prefix rather than the front, so they don't
  // fragment the cache key for a handful of low-cardinality values).
  const stable: string[] = [
    'Convert RecipeSpec → HydrateEnvelopeV1 (single JSON). Advanced toggles only for GROWTH+.',
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
  ];
  const stableText = stable.join('\n');

  // DYNAMIC SUFFIX: per-shop plan/locale context (low-cardinality but still
  // per-request), then the fully-unique RecipeSpec JSON, last.
  const dynamic = [
    `Context: plan=${planTier}, locale=${locale}.`,
    'RecipeSpec:',
    JSON.stringify(recipeSpec),
    'Output ONLY the JSON object.',
  ];

  return { prompt: `${stableText}\n${dynamic.join('\n')}`, cacheableChars: stableText.length };
}

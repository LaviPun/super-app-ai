/**
 * Prompt builder for the hydrate step: given a RecipeSpec, produce a full
 * config envelope. Token-optimized to stay within provider rate limits (e.g. 10k input/min).
 */
import type { RecipeSpec } from '@superapp/core';

/** Compact group list to reduce prompt tokens; full semantics in schema. */
const REQUIRED_GROUPS = 'content, layout, style, behavior, animation, visibility_targeting, rules_scheduling, localization, accessibility, performance, analytics';
const ENVELOPE_GROUPS =
  `adminConfig RULES — BOTH of these are REQUIRED:\n` +
  `1. adminConfig.jsonSchema.properties MUST include ALL 11 groups as top-level keys: ${REQUIRED_GROUPS}.\n` +
  `2. adminConfig.defaults MUST include ALL 11 groups as top-level keys (same names) with REAL, non-empty objects containing meaningful field defaults — NOT empty {} objects. Every group key in jsonSchema must have a corresponding populated defaults entry.`;

function getTypeSpecificGuidance(type: string): string {
  if (type === 'theme.popup') {
    return ' Popup: add mobile fallback trigger; behavior: focus trap, escape-to-close, scroll lock, return focus; style: CTA bg/text/hover/focus.';
  }
  if (type === 'theme.banner') {
    return ' Banner: block vs embed; add dismiss/persistence defaults.';
  }
  if (type === 'theme.contactForm') {
    return ' Contact form: include field-visibility and required toggles, consent/privacy controls, anti-spam defaults (honeypot), and submission routing (SHOPIFY_CONTACT vs APP_PROXY) with endpoint fallback.';
  }
  return '';
}

export function buildHydratePrompt(recipeSpec: RecipeSpec, merchantContext?: { planTier?: string; locale?: string }): string {
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
    ENVELOPE_GROUPS + getTypeSpecificGuidance(recipeSpec.type),

    'RecipeSpec:',
    JSON.stringify(recipeSpec),
    'Output ONLY the JSON object.',
  ];
  return parts.join('\n');
}

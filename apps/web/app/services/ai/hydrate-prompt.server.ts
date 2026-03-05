/**
 * Prompt builder for the hydrate step: given a RecipeSpec, produce a full
 * config envelope (admin schema, defaults, theme editor settings, validation report).
 */
import type { RecipeSpec } from '@superapp/core';

const ENVELOPE_GROUPS = `
Your adminConfigSchema.jsonSchema MUST include, at minimum, these property groups (as top-level or nested properties):
1) content: headline, body, images, icons, cta label/url, rich text rules
2) layout: position, alignment, width, maxWidth, spacing, grid, responsive rules
3) style: colors, typography, borders, radius, shadow, background, gradients, overlay
4) behavior: open/close logic, frequency capping, persistence, close actions, delays
5) animation: type, duration, easing, entrance/exit, reduced motion support
6) visibility_targeting: pages, products/collections, customer segments/tags, geo, device
7) rules_scheduling: start/end time, timezone, days, inventory/order conditions if relevant
8) localization: multi-locale strings, fallback rules
9) accessibility: aria labels, focus trap, keyboard navigation, contrast notes
10) performance: lazy load, defer, throttle, cache, network strategy
11) analytics: event toggles, sampling, debug mode, event property allowlist
`;

export function buildHydratePrompt(recipeSpec: RecipeSpec, _merchantContext?: { planTier?: string; locale?: string }): string {
  const parts: string[] = [
    'You are SuperApp AI: a senior Shopify Solutions Architect + Staff UI/UX Designer + QA Lead.',
    'Goal: Convert the given RecipeSpec into a production-ready HydrateEnvelope (single JSON object).',
    '',
    'HARD RULES:',
    '1) Output MUST be a single valid JSON object. No markdown, no code fences, no extra text.',
    '2) Do NOT ask questions. If something is ambiguous, make explicit assumptions and proceed.',
    '3) OS 2.0 only. Shopify-feasible: never propose a surface capability that does not exist.',
    '4) validationReport.overall must be PASS or WARN only. If you detect FAIL, revise the spec and set WARN with howToFix.',
    '',
    'REQUIRED OUTPUT SHAPE (HydrateEnvelope):',
    '- version: "2.0"',
    '- adminConfigSchema: { schemaVersion: "1.0", jsonSchema: {...}, uiSchema: {...}, defaults: {...} }',
    '- themeEditorSettings: { fields: [{ id, type, label, default?, options? }], limitsNotes?: [] }',
    '  Theme Editor must be minimal: e.g. enabled (boolean), module_variant (select), config_id (text).',
    '- uiTokens: { colors?, typography?, spacing?, radius?, shadow? } — each array of { token, default, themeAware? }',
    '- validationReport: { overall: "PASS"|"WARN", checks: [{ id, severity, status, description, howToFix? }], notes?: [] }',
    '',
    ENVELOPE_GROUPS,
    '',
    'RecipeSpec to materialize:',
    JSON.stringify(recipeSpec, null, 2),
    '',
    'Respond with ONLY the JSON object. No explanation before or after.',
  ];
  return parts.join('\n');
}

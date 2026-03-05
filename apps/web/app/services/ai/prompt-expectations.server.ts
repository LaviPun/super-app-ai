import type { ModuleType } from '@superapp/core';
import { LIMITS } from '@superapp/core';

/**
 * Prompt design principles (from real-world successful AI app prompts):
 * 1. Clear purpose — what we're building, who it's for.
 * 2. User-focused flow — step-by-step visitor experience so AI gets UX right.
 * 3. Lightweight tech hints — schema/format as "frame", not implementation.
 * 4. Edge cases / extras — responsive, accessibility, one clear CTA; mention when relevant.
 */

/** Purpose + guidance block: anchors the AI on goal, flow, and extras. */
export const PROMPT_PURPOSE_AND_GUIDANCE = `Purpose: You are generating Shopify storefront modules (popups, banners, notification bars, etc.) that merchants add to their theme. Each module is a single, deployable unit. Your output must be valid RecipeSpec JSON so it can be saved and deployed without errors. The audience is the store's visitors (shoppers).

User flow: When the merchant's request is vague or short, infer a clear visitor flow and reflect it in your options: who sees it (e.g. all visitors, or only on product page), when (e.g. after 5 seconds, on exit intent), and what they can do (e.g. copy a code, click CTA, close). Vary the 3 options by flow (e.g. different triggers, different pages, different frequency). In your "explanation" for each option, describe the flow in one line (e.g. "Shows 5s after load on homepage, once per session, with one primary CTA").

Extras to consider when relevant: responsive (mobile vs desktop), accessibility (focus, reduced motion), and one clear primary CTA. If the request mentions a coupon/code, ensure the content makes it easy to copy. Mention these in your explanation when they drive the design.`;

/**
 * Minimal valid JSON examples per type. Shown to the AI so it knows the EXACT shape we expect.
 * All config fields (content + controls) go in a single "config" object.
 */
const EXPECTED_SHAPE_EXAMPLES: Partial<Record<ModuleType, string>> = {
  'theme.popup': `{
  "type": "theme.popup",
  "name": "string, ${LIMITS.nameMin}-${LIMITS.nameMax} chars",
  "category": "STOREFRONT_UI",
  "requires": ["THEME_ASSETS"],
  "config": {
    "title": "string, 1-60 chars, required",
    "body": "string, 0-240, optional",
    "trigger": "ON_LOAD | ON_EXIT_INTENT | ON_SCROLL_25 | ON_SCROLL_50 | ON_SCROLL_75 | ON_CLICK | TIMED",
    "delaySeconds": 0,
    "frequency": "EVERY_VISIT | ONCE_PER_SESSION | ONCE_PER_DAY | ONCE_PER_WEEK | ONCE_EVER",
    "maxShowsPerDay": 0,
    "showOnPages": "ALL | HOMEPAGE | COLLECTION | PRODUCT | CART | CUSTOM",
    "customPageUrls": [],
    "autoCloseSeconds": 0,
    "showCloseButton": true,
    "countdownEnabled": false,
    "countdownSeconds": 0,
    "countdownLabel": "",
    "ctaText": "optional",
    "ctaUrl": "https://... optional, must be valid URL or omit",
    "secondaryCtaText": "optional",
    "secondaryCtaUrl": "optional, valid URL or omit"
  },
  "style": { "layout": { "mode": "overlay", "anchor": "center" } }
}`,

  'theme.banner': `{
  "type": "theme.banner",
  "name": "string, ${LIMITS.nameMin}-${LIMITS.nameMax} chars",
  "category": "STOREFRONT_UI",
  "requires": ["THEME_ASSETS"],
  "config": {
    "heading": "string, 1-80, required",
    "subheading": "optional",
    "ctaText": "optional",
    "ctaUrl": "optional, valid URL or omit",
    "imageUrl": "optional, valid URL or omit",
    "enableAnimation": false
  },
  "style": { "layout": { "mode": "inline", "anchor": "top" } }
}`,

  'theme.notificationBar': `{
  "type": "theme.notificationBar",
  "name": "string, ${LIMITS.nameMin}-${LIMITS.nameMax} chars",
  "category": "STOREFRONT_UI",
  "requires": ["THEME_ASSETS"],
  "config": {
    "message": "string, 1-140, required",
    "linkText": "optional",
    "linkUrl": "optional, valid URL or omit",
    "dismissible": true
  },
  "style": {}
}`,

  'theme.effect': `{
  "type": "theme.effect",
  "name": "string, ${LIMITS.nameMin}-${LIMITS.nameMax} chars",
  "category": "STOREFRONT_UI",
  "requires": ["THEME_ASSETS"],
  "config": {
    "effectKind": "snowfall | confetti",
    "intensity": "low | medium | high",
    "speed": "slow | normal | fast"
  },
  "placement": { "enabled_on": { "templates": ["index", "product"] } },
  "style": { "layout": { "zIndex": "overlay" }, "accessibility": { "reducedMotion": true } }
}`,

  'proxy.widget': `{
  "type": "proxy.widget",
  "name": "string, ${LIMITS.nameMin}-${LIMITS.nameMax} chars",
  "category": "STOREFRONT_UI",
  "requires": ["APP_PROXY"],
  "config": {
    "widgetId": "lowercase-with-hyphens, 3-40 chars",
    "mode": "JSON | HTML",
    "title": "string, 1-80",
    "message": "optional"
  },
  "style": {}
}`,
};

const VALIDATION_RULES = `
How we validate your response:
- We parse your JSON and validate with a strict schema (Zod). If any field is wrong, the whole option is rejected.
- Enum values must be EXACTLY as shown (e.g. ON_LOAD not "on_load", TIMED not "timed"). Use UPPERCASE with underscores.
- "anchor" in style.layout must be exactly one of: top, bottom, left, right, center (not "bottom-right" or "center-bottom").
- Optional URL fields (ctaUrl, secondaryCtaUrl, linkUrl): either omit the key or use a valid https URL. Empty string "" is invalid.
- Numbers must be numbers (e.g. delaySeconds: 5 not "5").`;

const INVALID_DO_NOT = `
Invalid / do NOT do:
- Do NOT use top-level "settings" or "controls". Put ALL content and control fields inside a single "config" object.
- Do NOT include "assets", "meta", "settings", or "controls" as keys on the recipe. Only type, name, category, requires, config, and optionally style.
- Do NOT use lowercase or kebab-case for enums (e.g. use ON_EXIT_INTENT not on_exit_intent or exit-intent).`;

const RESPONSE_FORMAT = `
Exact response format we expect (your reply must be valid JSON in this shape only):
{
  "options": [
    { "explanation": "1-2 sentences describing this option", "recipe": { <one full recipe object as above> } },
    { "explanation": "...", "recipe": { ... } },
    { "explanation": "...", "recipe": { ... } }
  ]
}
You must return exactly 3 options. Each "recipe" must follow the expected shape for the module type with no extra keys.`;

/**
 * Full StorefrontStyle schema as a string (Zod-level constraints).
 * Used so the AI has every allowed value for style when generating storefront modules.
 */
export const STOREFRONT_STYLE_SCHEMA_SPEC = `Storefront style (optional object). All fields are optional; defaults apply if omitted.
- layout: mode = "inline"|"overlay"|"sticky"|"floating"; anchor = "top"|"bottom"|"left"|"right"|"center"; offsetX, offsetY = -100..100; width = "auto"|"container"|"narrow"|"wide"|"full"; zIndex = "base"|"dropdown"|"sticky"|"overlay"|"modal".
- spacing: padding, margin, gap = "none"|"tight"|"medium"|"loose".
- typography: size = "XS"|"SM"|"MD"|"LG"|"XL"|"2XL"; weight = "normal"|"medium"|"bold"; lineHeight = "tight"|"normal"|"relaxed"; align = "left"|"center"|"right".
- colors: text, background, border, buttonBg, buttonText, overlayBackdrop = hex #RRGGBB; overlayBackdropOpacity = 0-1.
- shape: radius = "none"|"sm"|"md"|"lg"|"xl"|"full"; borderWidth = "none"|"thin"|"medium"|"thick"; shadow = "none"|"sm"|"md"|"lg".
- responsive: hideOnMobile, hideOnDesktop = boolean.
- accessibility: focusVisible, reducedMotion = boolean.
- customCss: optional string, max ${LIMITS.customCssMax} chars (sanitized at compile).`;

/**
 * Full recipe config schema per type (Zod-level: every field, type, min/max, enums).
 * Compiled into the prompt so the AI gets complete validation constraints.
 */
const FULL_RECIPE_SCHEMA_SPECS: Partial<Record<ModuleType, string>> = {
  'theme.popup': `theme.popup — full config schema (Zod validation; every field must match):
Top-level: type="theme.popup", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["THEME_ASSETS"], config={...}, style=optional.
config.title: string, required, ${LIMITS.popupTitleMin}-${LIMITS.popupTitleMax} chars.
config.body: string, optional, 0-${LIMITS.popupBodyMax} chars.
config.trigger: enum exactly one of: ON_LOAD, ON_EXIT_INTENT, ON_SCROLL_25, ON_SCROLL_50, ON_SCROLL_75, ON_CLICK, TIMED.
config.delaySeconds: number, int, 0-${LIMITS.popupDelaySecondsMax}, default 0.
config.frequency: enum exactly: EVERY_VISIT, ONCE_PER_SESSION, ONCE_PER_DAY, ONCE_PER_WEEK, ONCE_EVER.
config.maxShowsPerDay: number, int, 0-${LIMITS.popupMaxShowsPerDayMax}, default 0.
config.showOnPages: enum exactly: ALL, HOMEPAGE, COLLECTION, PRODUCT, CART, CUSTOM.
config.customPageUrls: array of strings, max ${LIMITS.popupCustomPageUrlsMax} items, each max ${LIMITS.popupCustomPageUrlMax} chars.
config.autoCloseSeconds: number, int, 0-${LIMITS.popupDelaySecondsMax}, default 0.
config.showCloseButton: boolean, default true.
config.countdownEnabled: boolean, default false.
config.countdownSeconds: number, int, 0-${LIMITS.popupCountdownSecondsMax}, default 0.
config.countdownLabel: string, max ${LIMITS.popupCountdownLabelMax} chars, default "".
config.ctaText, config.secondaryCtaText: string, optional, max 40 chars.
config.ctaUrl, config.secondaryCtaUrl: optional; if present must be valid URL (https), empty string invalid.`,

  'theme.banner': `theme.banner — full config schema (Zod validation):
Top-level: type="theme.banner", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["THEME_ASSETS"], config={...}, style=optional.
config.heading: string, required, ${LIMITS.headingMin}-${LIMITS.headingMax} chars.
config.subheading: string, optional, 0-${LIMITS.subheadingMax} chars.
config.ctaText: string, optional, 0-40 chars.
config.ctaUrl: optional; if present valid URL (https), empty string invalid.
config.imageUrl: optional; if present valid URL (https), empty string invalid.
config.enableAnimation: boolean, default false.`,

  'theme.notificationBar': `theme.notificationBar — full config schema (Zod validation):
Top-level: type="theme.notificationBar", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["THEME_ASSETS"], config={...}, style=optional.
config.message: string, required, ${LIMITS.notificationBarMessageMin}-${LIMITS.notificationBarMessageMax} chars.
config.linkText: string, optional, 0-40 chars.
config.linkUrl: optional; if present valid URL (https), empty string invalid.
config.dismissible: boolean, default true.`,

  'theme.effect': `theme.effect — full config schema (Zod validation):
Top-level: type="theme.effect", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["THEME_ASSETS"], config={...}, placement=optional, style=optional.
config.effectKind: enum exactly "snowfall" or "confetti", required.
config.intensity: enum exactly "low" | "medium" | "high", default "medium".
config.speed: enum exactly "slow" | "normal" | "fast", default "normal".`,

  'proxy.widget': `proxy.widget — full config schema (Zod validation):
Top-level: type="proxy.widget", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["APP_PROXY"], config={...}, style=optional.
config.widgetId: string, required, regex [a-z0-9-] only, length 3-40.
config.mode: enum exactly: "JSON" or "HTML", default "HTML".
config.title: string, required, ${LIMITS.headingMin}-${LIMITS.nameMax} chars.
config.message: string, optional, 0-${LIMITS.popupBodyMax} chars.`,
};

/** Returns the full recipe schema spec for the given type (all Zod-level constraints as a string). */
export function getFullRecipeSchemaSpec(moduleType: ModuleType): string {
  return FULL_RECIPE_SCHEMA_SPECS[moduleType] ?? `Module type ${moduleType}: use type, name, category, requires, config (single object), and optionally style. No top-level settings, controls, assets, or meta.`;
}

/** Returns the full StorefrontStyle schema as a string (for storefront types). */
export function getStorefrontStyleSchemaSpec(): string {
  return STOREFRONT_STYLE_SCHEMA_SPEC;
}

/** Shorter block for modify flow: we send current spec, so we only need validation + invalid + response format. */
export function getModifyPromptExpectations(): string {
  return [
    'Output rules:',
    VALIDATION_RULES.trim(),
    INVALID_DO_NOT.trim(),
    'Return JSON: { "options": [ { "explanation": "...", "recipe": { <full updated recipe, same shape as current> } }, ... ] } with exactly 3 options. Each recipe must keep the same top-level keys (type, name, category, requires, config, style) and no extra keys (no settings, controls, assets, meta).',
  ].join('\n\n');
}

/**
 * Returns a single block to inject into the AI prompt: expected shape, validation rules, invalid examples, and response format.
 */
export function getPromptExpectations(moduleType: ModuleType): string {
  const example = EXPECTED_SHAPE_EXAMPLES[moduleType];
  const shapeBlock = example
    ? `Expected recipe shape for "${moduleType}" (use this structure exactly; all config fields in one "config" object):\n${example}`
    : `Use type, name, category, requires, config (single object with all settings and controls), and optionally style. No "settings", "controls", "assets", or "meta" at top level.`;

  return [
    'Technical frame (use this structure so the module deploys without errors):',
    shapeBlock,
    VALIDATION_RULES.trim(),
    INVALID_DO_NOT.trim(),
    RESPONSE_FORMAT.trim(),
  ].join('\n\n');
}

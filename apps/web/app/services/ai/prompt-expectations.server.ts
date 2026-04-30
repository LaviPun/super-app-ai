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

  'theme.contactForm': `{
  "type": "theme.contactForm",
  "name": "string, ${LIMITS.nameMin}-${LIMITS.nameMax} chars",
  "category": "STOREFRONT_UI",
  "requires": ["THEME_ASSETS"],
  "config": {
    "title": "string, 1-80, required",
    "subtitle": "optional, max 200",
    "submitLabel": "string, 1-40",
    "successMessage": "string, 1-200",
    "errorMessage": "string, 1-200",
    "submissionMode": "SHOPIFY_CONTACT | APP_PROXY",
    "proxyEndpointPath": "/apps/superapp/capture",
    "recipientEmail": "optional email",
    "showName": true, "showEmail": true, "showPhone": false, "showCompany": false, "showOrderNumber": false, "showSubject": true, "showMessage": true,
    "nameRequired": true, "emailRequired": true, "phoneRequired": false, "companyRequired": false, "orderNumberRequired": false, "subjectRequired": false, "messageRequired": true,
    "consentRequired": false, "consentLabel": "optional text",
    "sendCopyToCustomer": false, "includeCustomerContext": true,
    "spamProtection": "NONE | HONEYPOT", "honeypotFieldName": "website",
    "tags": [],
    "successRedirectUrl": "optional valid URL"
  },
  "style": { "layout": { "mode": "inline", "anchor": "top" } }
}`,

  'theme.effect': `{
  "type": "theme.effect",
  "name": "string, ${LIMITS.nameMin}-${LIMITS.nameMax} chars",
  "category": "STOREFRONT_UI",
  "requires": ["THEME_ASSETS"],
  "config": {
    "effectKind": "snowfall | confetti",
    "intensity": "low | medium | high",
    "speed": "slow | normal | fast",
    "startTrigger": "page_load | scroll_25 | time_3s | time_5s | time_10s",
    "durationSeconds": 0,
    "overlayPlacement": "full_screen | header_only | footer_only | above_fold",
    "reducedMotion": true
  },
  "placement": { "enabled_on": { "templates": ["index", "product"] } },
  "style": { "layout": { "zIndex": "overlay" }, "accessibility": { "reducedMotion": true } }
}`,

  'theme.floatingWidget': `{
  "type": "theme.floatingWidget",
  "name": "string, ${LIMITS.nameMin}-${LIMITS.nameMax} chars",
  "category": "STOREFRONT_UI",
  "requires": ["THEME_ASSETS"],
  "config": {
    "variant": "whatsapp | chat | coupon | cart | scroll_top | custom",
    "label": "optional string, 0-60 chars",
    "iconUrl": "optional, valid https URL or omit",
    "anchor": "bottom_right | bottom_left | top_right | top_left | bottom_center",
    "offsetX": 24,
    "offsetY": 24,
    "onClick": "open_whatsapp | open_url | open_popup | open_drawer | scroll_top",
    "message": "optional, 0-500 chars (prefilled WhatsApp/chat text)",
    "url": "optional, valid https URL or omit",
    "hideOnMobile": false,
    "hideOnDesktop": false
  },
  "style": { "layout": { "mode": "floating", "zIndex": "overlay" } }
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

const RESPONSE_FORMAT_MULTI = `
Exact response format we expect (your reply must be valid JSON in this shape only):
{
  "options": [
    { "explanation": "1-2 sentences describing this option", "recipe": { <one full recipe object as above> } },
    { "explanation": "...", "recipe": { ... } },
    { "explanation": "...", "recipe": { ... } }
  ]
}
You must return exactly 3 options. Each "recipe" must follow the expected shape for the module type with no extra keys.`;

const RESPONSE_FORMAT_SINGLE = `
Exact response format we expect (your reply must be valid JSON in this shape only):
{ "explanation": "1-2 sentences describing this option", "recipe": { <one full recipe object as above> } }
Return exactly 1 recipe. The "recipe" must follow the expected shape for the module type with no extra keys.`;

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

  'theme.contactForm': `theme.contactForm — full config schema (Zod validation):
Top-level: type="theme.contactForm", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["THEME_ASSETS"], config={...}, placement=optional, style=optional.
config.title: string, required, ${LIMITS.headingMin}-${LIMITS.headingMax} chars.
config.subtitle: string, optional, 0-${LIMITS.subheadingMax} chars.
config.submitLabel: string, required, 1-40 chars.
config.successMessage: string, required, 1-${LIMITS.subheadingMax} chars.
config.errorMessage: string, required, 1-${LIMITS.subheadingMax} chars.
config.showName/showEmail/showPhone/showCompany/showOrderNumber/showSubject/showMessage: boolean controls for field visibility.
config.nameRequired/emailRequired/phoneRequired/companyRequired/orderNumberRequired/subjectRequired/messageRequired: boolean required toggles.
config.consentRequired: boolean. config.consentLabel: string max 120.
config.submissionMode: enum exactly SHOPIFY_CONTACT | APP_PROXY.
config.proxyEndpointPath: string path regex ^/[a-z0-9-/]{1,200}$.
config.recipientEmail: optional valid email.
config.sendCopyToCustomer: boolean. config.includeCustomerContext: boolean.
config.spamProtection: enum exactly NONE | HONEYPOT.
config.honeypotFieldName: string 1-40 chars.
config.tags: string[] max 20 items, each 1-40 chars.
config.successRedirectUrl: optional valid URL.`,

  'theme.effect': `theme.effect — full config schema (Zod validation):
Top-level: type="theme.effect", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["THEME_ASSETS"], config={...}, placement=optional, style=optional.
config.effectKind: enum exactly "snowfall" or "confetti", required.
config.intensity: enum exactly "low" | "medium" | "high", default "medium".
config.speed: enum exactly "slow" | "normal" | "fast", default "normal".
config.startTrigger: enum exactly "page_load" | "scroll_25" | "time_3s" | "time_5s" | "time_10s", default "page_load".
config.durationSeconds: integer 0-300, default 0 (0 = play indefinitely).
config.overlayPlacement: enum exactly "full_screen" | "header_only" | "footer_only" | "above_fold", default "full_screen".
config.reducedMotion: boolean, default true (disable effect when user prefers reduced motion — always set true unless explicit creative reason).`,

  'theme.floatingWidget': `theme.floatingWidget — full config schema (Zod validation):
Top-level: type="theme.floatingWidget", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["THEME_ASSETS"], config={...}, placement=optional, style=optional.
config.variant: enum exactly "whatsapp" | "chat" | "coupon" | "cart" | "scroll_top" | "custom", required.
config.label: string, optional, 0-60 chars.
config.iconUrl: optional URL (https); omit if not needed.
config.anchor: enum exactly "bottom_right" | "bottom_left" | "top_right" | "top_left" | "bottom_center", default "bottom_right".
config.offsetX: integer -200..200, default 24.
config.offsetY: integer -200..200, default 24.
config.onClick: enum exactly "open_whatsapp" | "open_url" | "open_popup" | "open_drawer" | "scroll_top", default "open_url".
config.message: string, optional, 0-500 chars (pre-filled text for WhatsApp or chat on click).
config.url: optional URL (https); required when onClick is open_url or open_whatsapp (wa.me/... format); omit otherwise.
config.hideOnMobile: boolean, default false.
config.hideOnDesktop: boolean, default false.
Style tip: use layout.mode="floating" and layout.zIndex="overlay" so the widget floats over page content.`,

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
 * Settings pack defaults per module type (Phase 3.1).
 * Injected into the prompt so the AI starts from known-good defaults and fills all relevant fields,
 * rather than producing minimal "safe" configs. Each pack lists the fields the AI MUST populate.
 */
const SETTINGS_PACKS: Partial<Record<ModuleType, string>> = {
  'theme.popup': `Settings pack — theme.popup MUST include all of these:
CONTENT: title (clear value proposition), body (optional supporting copy, empty string OK), ctaText (primary action label).
TRIGGER: trigger (choose based on intent: ON_LOAD for immediate, ON_EXIT_INTENT for cart/engagement, TIMED for delay), delaySeconds (0 unless TIMED), frequency (ONCE_PER_SESSION for most), showOnPages (specific page or ALL).
CLOSE: showCloseButton (true), autoCloseSeconds (0 unless auto-dismiss is appropriate).
OPTIONAL but valuable: countdownEnabled + countdownSeconds for urgency; secondaryCtaText for a dismiss link.
STYLE: set colors, typography, shape, and layout anchor so each of the 3 options looks visually distinct.`,

  'theme.banner': `Settings pack — theme.banner MUST include all of these:
CONTENT: heading (concise, action-oriented), subheading (supporting detail or empty string), ctaText + ctaUrl (clear destination).
LAYOUT: style.layout.mode (inline for in-page, sticky for persistent), style.layout.anchor (top or bottom for sticky).
STYLE: differentiate the 3 options with distinct colors, typography.size, and shape.radius.
OPTIONAL: imageUrl for a visual banner; enableAnimation for entrance effect.`,

  'theme.notificationBar': `Settings pack — theme.notificationBar MUST include all of these:
CONTENT: message (concise, 1 sentence, max 140 chars), linkText + linkUrl (optional CTA).
CONTROLS: dismissible (true by default; set false for critical messages).
STYLE: sticky top, high-contrast colors. Vary the 3 options by message tone (urgent / friendly / informational) and color scheme.`,

  'theme.contactForm': `Settings pack — theme.contactForm MUST include all of these:
CONTENT: title, subtitle (optional), submitLabel, successMessage, errorMessage.
FIELDS: choose visibility + required toggles for name/email/phone/company/orderNumber/subject/message.
PRIVACY: consentRequired + consentLabel when lead/contact capture is involved.
SUBMISSION: submissionMode (SHOPIFY_CONTACT for native contact route, APP_PROXY for custom processing), proxyEndpointPath when APP_PROXY.
ANTI-SPAM: spamProtection + honeypotFieldName (recommended HONEYPOT).
OPS: tags, includeCustomerContext, sendCopyToCustomer based on merchant needs.
STYLE: inline layout, readable field spacing, clear primary button contrast.`,

  'theme.effect': `Settings pack — theme.effect MUST include all of these:
REQUIRED: effectKind (snowfall or confetti based on context), intensity, speed.
TIMING: startTrigger (page_load for immediate, time_3s/time_5s for delay, scroll_25 for scroll-based), durationSeconds (0 for continuous or 5-30s for burst).
PLACEMENT: overlayPlacement (full_screen default, header_only for subtle, above_fold for hero-only).
ACCESSIBILITY: reducedMotion must be true unless merchant explicitly asks otherwise.
VARY 3 options by: effectKind + intensity + startTrigger + overlayPlacement (e.g. subtle snow header / medium confetti scroll / high confetti full burst).`,

  'theme.floatingWidget': `Settings pack — theme.floatingWidget MUST include all of these:
VARIANT: variant (choose from whatsapp/chat/coupon/cart/scroll_top/custom based on intent), anchor (default bottom_right), onClick action.
LABEL: label (short, clear — e.g. "Chat with us", "Get 10% off", "WhatsApp us").
URL/MESSAGE: url (required for open_url / open_whatsapp variants — use wa.me/... for WhatsApp), message (pre-filled chat text for WhatsApp).
POSITIONING: offsetX/offsetY (default 24px from corner; adjust for non-default).
VISIBILITY: hideOnMobile/hideOnDesktop (usually both false unless device-specific UX).
STYLE: layout.mode="floating", layout.zIndex="overlay"; vary colors and shape across the 3 options.`,

  'proxy.widget': `Settings pack — proxy.widget MUST include all of these:
REQUIRED: widgetId (unique lowercase-with-hyphens ID, descriptive — e.g. "loyalty-points-widget"), mode (HTML for rich content, JSON for data), title.
OPTIONAL: message (introductory text shown above the proxy-rendered content).
NOTE: proxy.widget uses APP_PROXY — content is rendered server-side; use theme.floatingWidget instead for floating buttons.`,
};

/**
 * Returns the settings pack for the given module type.
 * Injected into the prompt to ensure the AI always populates all relevant fields.
 */
export function getSettingsPack(moduleType: ModuleType): string | undefined {
  return SETTINGS_PACKS[moduleType];
}

/**
 * Returns a single block to inject into the AI prompt: expected shape, validation rules, invalid examples, and response format.
 * @param mode - 'multi' (default, legacy 3-option call) or 'single' (parallel path: 1 recipe per call)
 */
export function getPromptExpectations(moduleType: ModuleType, mode: 'multi' | 'single' = 'multi'): string {
  const example = EXPECTED_SHAPE_EXAMPLES[moduleType];
  const shapeBlock = example
    ? `Expected recipe shape for "${moduleType}" (use this structure exactly; all config fields in one "config" object):\n${example}`
    : `Use type, name, category, requires, config (single object with all settings and controls), and optionally style. No "settings", "controls", "assets", or "meta" at top level.`;

  const responseFormat = mode === 'single' ? RESPONSE_FORMAT_SINGLE : RESPONSE_FORMAT_MULTI;

  return [
    'Technical frame (use this structure so the module deploys without errors):',
    shapeBlock,
    VALIDATION_RULES.trim(),
    INVALID_DO_NOT.trim(),
    responseFormat.trim(),
  ].join('\n\n');
}

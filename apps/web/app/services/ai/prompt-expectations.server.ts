import type { ModuleType } from '@superapp/core';
import { LIMITS, describeTypeEnums } from '@superapp/core';

/**
 * Prompt design principles (from real-world successful AI app prompts):
 * 1. Clear purpose — what we're building, who it's for.
 * 2. User-focused flow — step-by-step visitor experience so AI gets UX right.
 * 3. Lightweight tech hints — schema/format as "frame", not implementation.
 * 4. Edge cases / extras — responsive, accessibility, one clear CTA; mention when relevant.
 */

/** Purpose + guidance block: anchors the AI on goal, flow, and extras. */
export const PROMPT_PURPOSE_AND_GUIDANCE = `Purpose: You are generating Shopify storefront modules that merchants add to their theme. Each module must be a single deployable RecipeSpec JSON object that validates and can ship without manual cleanup. The end user is the shopper.

Storefront sections are NOT limited to a fixed catalog. For ANY custom or novel section (FAQ, lookbook, size chart, hero, comparison table, anything), use type "theme.section": set config.kind to a short recommendation tag (e.g. "faq", "hero", "lookbook", "custom") — kind is a RECOMMENDATION, never a constraint — declare the section's settings in config.fieldSchema with values in config.fields, use config.blocks for repeatable content, and only use config.advancedCustom (sanitized custom HTML/CSS/JS) for truly bespoke markup. The named theme.* types (banner, popup, notificationBar, …) are convenient presets of theme.section; prefer them when they fit, but never force a request into them — reach for theme.section whenever the merchant wants something they don't cover.

Design quality bar: produce premium, conversion-aware UI decisions that are still implementable in RecipeSpec fields. Premium means clear hierarchy, intentional typography, role-based color usage, consistent spacing rhythm, and polished interaction behavior.

User flow: If the merchant request is vague, infer a concrete shopper journey and encode it in each option: who sees it, when it appears, where it appears, what action is expected, and what happens after action/close. Vary options by strategy, not just wording.

Interaction states (when relevant): include behavior for default, hover/focus, pressed, dismiss/close, success, and error/invalid states. For timed or trigger-based modules, include first exposure vs repeat exposure behavior.

Responsive + accessibility: specify mobile vs desktop behavior, focus visibility, reduced motion handling, and readable content density.

CTA quality: each option should have one dominant primary action with clear value framing.

If the request mentions a coupon/code, optimize for effortless copy and confirmation feedback. In each explanation, include one concise line describing audience, trigger, placement, primary CTA, and key interaction behavior.`;

export const UI_DESIGNER_REFINEMENT_PASS = `UI_DESIGNER_PASS:
- Premium visual target: distinctive and product-appropriate storefront UI, not generic templates.
- Hierarchy rules: headline communicates value quickly, supporting copy clarifies benefit, CTA is the most visually dominant action.
- Typography rules: strong heading/body contrast with high readability.
- Spacing rhythm: tight within groups, looser between groups, with scan-friendly section cadence.
- Color system: role-based colors (surface, text, accent, semantic) and strong contrast.
- Interaction polish: include hover/focus/pressed and dismiss behavior; motion is subtle and reduced-motion safe.
- Option differentiation: each option must differ in both UX strategy and visual strategy.`;

export const FRONTEND_DEVELOPER_REFINEMENT_PASS = `FRONTEND_DEVELOPER_PASS:
- Output must map cleanly to RecipeSpec fields with no speculative keys.
- Keep config values practical for rendering (valid enums, valid URLs, realistic copy lengths).
- Keep styling decisions implementable in storefront extension surfaces.
- Prefer deterministic, maintainable settings over fragile gimmicks.`;

export const PREMIUM_OUTPUT_GUARDRAILS = `Premium output guardrails:
- Avoid generic filler copy and weak CTA labels.
- Require conversion clarity: value-forward headline, hesitation-reducing support copy, outcome-focused CTA.
- Require visual intent: deliberate hierarchy, spacing rhythm, role-based color choices.
- Require interaction intent: include at least one meaningful state behavior per option.
- Require implementability: valid RecipeSpec fields/enums only.
- Distinguish options by strategy depth, not superficial wording swaps.`;

/**
 * Minimal valid JSON examples per type. Shown to the AI so it knows the EXACT shape we expect.
 * All config fields (content + controls) go in a single "config" object.
 */
const EXPECTED_SHAPE_EXAMPLES: Partial<Record<ModuleType, string>> = {
  'theme.section': `{
  "type": "theme.section",
  "name": "string, ${LIMITS.nameMin}-${LIMITS.nameMax} chars",
  "category": "STOREFRONT_UI",
  "requires": ["THEME_ASSETS"],
  "config": {
    "kind": "free-form recommendation tag, e.g. 'hero' | 'faq' | 'lookbook' | 'notification-bar' | 'custom'",
    "activation": "section | global | overlay",
    "title": "optional section title",
    "fieldSchema": { "fields": [{ "name": "string", "type": "text|textarea|number|boolean|date|url|email|select", "required": false }] },
    "fields": { "exampleField": "value bound at render" },
    "blocks": [{ "kind": "string", "text": "optional", "imageUrl": "optional url" }],
    "advancedCustom": { "customHtml": "optional sanitized HTML", "customJs": "optional sandboxed JS" }
  },
  "style": {}
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
  'theme.section': `theme.section — generic, UNRESTRICTED storefront section / theme app extension (Zod validation):
Top-level: type="theme.section", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["THEME_ASSETS"], config={...}, placement=optional, style=optional.
config.kind: string, free-form recommendation tag (e.g. 'hero' | 'faq' | 'lookbook' | 'banner' | 'popup' | 'notification-bar' | 'custom'). NEVER an enum — build ANY section.
config.activation: enum section | global | overlay (overlay = popup/modal behavior).
config.title: string, optional. config.subtitle/body: string, optional.
config.fieldSchema: { fields: [{ name, type: text|textarea|number|boolean|date|url|email|select, required? }] } — declare typed merchant settings.
config.fields: object — values for the declared fieldSchema, bound at render.
config.blocks: array of { kind: string, text?, url?, imageUrl?, fields? } — repeatable content.
config.advancedCustom: { customHtml?, customCss?, customJs? } — sanitized escape hatch, sandboxed at preview + CSP-bound at deploy.
Overlay/popup kinds (activation="overlay") may also set: trigger (ON_LOAD|ON_EXIT_INTENT|ON_SCROLL_25|ON_SCROLL_50|ON_SCROLL_75|ON_CLICK|TIMED), delaySeconds(0-${LIMITS.popupDelaySecondsMax}), frequency (EVERY_VISIT|ONCE_PER_SESSION|ONCE_PER_DAY|ONCE_PER_WEEK|ONCE_EVER), maxShowsPerDay(0-${LIMITS.popupMaxShowsPerDayMax}), showOnPages (ALL|HOMEPAGE|COLLECTION|PRODUCT|CART|CUSTOM), customPageUrls(string[] max ${LIMITS.popupCustomPageUrlsMax}), autoCloseSeconds(0-${LIMITS.popupDelaySecondsMax}), showCloseButton(bool), countdownEnabled(bool), countdownSeconds(0-${LIMITS.popupCountdownSecondsMax}), countdownLabel(max ${LIMITS.popupCountdownLabelMax}), ctaText/secondaryCtaText(max 40), ctaUrl/secondaryCtaUrl(valid https URL or omit).
Contact-form kind (kind="contactForm") may also set: title(${LIMITS.headingMin}-${LIMITS.headingMax}), subtitle(0-${LIMITS.subheadingMax}), submitLabel(1-40), successMessage/errorMessage(1-${LIMITS.subheadingMax}), showName/showEmail/showPhone/showCompany/showOrderNumber/showSubject/showMessage(bool), matching *Required(bool), consentRequired(bool)+consentLabel(max 120), submissionMode(SHOPIFY_CONTACT|APP_PROXY), proxyEndpointPath(^/[a-z0-9-/]{1,200}$), recipientEmail(valid email opt), sendCopyToCustomer/includeCustomerContext(bool), spamProtection(NONE|HONEYPOT), honeypotFieldName(1-40), tags(string[] max 20), successRedirectUrl(valid URL opt).
Effect kind (kind="effect", activation="overlay") may also set: effectKind(recommend "snowfall"|"confetti" — free-form), intensity("low"|"medium"|"high"), speed("slow"|"normal"|"fast"), startTrigger("page_load"|"scroll_25"|"time_3s"|"time_5s"|"time_10s"), durationSeconds(0-300, 0=indefinite), overlayPlacement("full_screen"|"header_only"|"footer_only"|"above_fold"), reducedMotion(bool — always true unless explicit creative reason).
Floating-widget kind (kind="floatingWidget", activation="global") may also set: variant("whatsapp"|"chat"|"coupon"|"cart"|"scroll_top"|"custom"), label(0-60), iconUrl(https opt), anchor("bottom_right"|"bottom_left"|"top_right"|"top_left"|"bottom_center"), offsetX/offsetY(-200..200), onClick("open_whatsapp"|"open_url"|"open_popup"|"open_drawer"|"scroll_top"), message(0-500, prefilled WhatsApp/chat text), url(https; required for open_url/open_whatsapp), hideOnMobile/hideOnDesktop(bool). Use style layout.mode="floating", zIndex="overlay".`,

  'proxy.widget': `proxy.widget — full config schema (Zod validation):
Top-level: type="proxy.widget", name=string ${LIMITS.nameMin}-${LIMITS.nameMax} chars, category="STOREFRONT_UI", requires=["APP_PROXY"], config={...}, style=optional.
config.widgetId: string, required, regex [a-z0-9-] only, length 3-40.
config.mode: enum exactly: "JSON" or "HTML", default "HTML".
config.title: string, required, ${LIMITS.headingMin}-${LIMITS.nameMax} chars.
config.message: string, optional, 0-${LIMITS.popupBodyMax} chars.`,
};

/**
 * R2.1 — the display-rules (rule-engine) authoring contract. Terse + enum-anchored
 * so the model cannot drift outside the resolver allowlist. Appended to the two
 * storefront types that pin the `ruleEngine` pack (theme.section, proxy.widget).
 * The pack is optional + advanced; omit it (or set enabled:false) to always show.
 */
export const DISPLAY_RULES_SPEC = `DISPLAY RULES (config.ruleEngine — optional, advanced). To make a storefront module appear only for some visitors, emit:
  config.ruleEngine = { enabled: true, logic: 'AND'|'OR', matchAction: 'SHOW'|'HIDE', groups: [ { logic: 'AND'|'OR', conditions: [ { object, attribute, operator, value }, ... ] } ] }
Use ONLY these (object, attribute) pairs — unknown pairs are REJECTED:
  product: tags,type,vendor,handle,price,collectionIds,available
  customer: loggedIn,tags,ordersCount,totalSpent,countryCode,acceptsMarketing
  cart: subtotal,itemCount,lineCount,containsProductId,containsCollectionId,discountCode
  geo: countryCode
  temporal: date,dayOfWeek,timeOfDay
  behavioral: recentlyViewedProductId,pagesViewedThisSession,sessionCount,utmSource,utmCampaign,referrerContains,scrollPercent,exitIntent
Operators (exactly these): equal_to,not_equal_to,greater_than,less_than,greater_than_or_equal,less_than_or_equal,contains,not_contains,starts_with,ends_with,is_set,is_not_set. (is_set/is_not_set take no value.)
Rules are evaluated top-to-bottom. Omit config.ruleEngine (or set enabled:false) to ALWAYS show — do this for any request that does not ask to restrict who/when the module appears. Do NOT invent objects/attributes/operators.`;

/** Types that pin the rule-engine pack and therefore get the display-rules contract. */
const RULE_ENGINE_TYPES: ReadonlySet<ModuleType> = new Set<ModuleType>(['theme.section', 'proxy.widget']);

/**
 * R2.2 — the pricing (discount) authoring contract. Appended to the two Function
 * types that pin the `pricing` pack (functions.discountRules, functions.cartTransform).
 * The pack is optional; `pricing` SUPERSEDES the legacy `rules[]` when emitted, so
 * the model must not emit both. Enum-anchored to keep the model in the closed set.
 */
export const PRICING_SPEC = `PRICING (config.pricing — optional). For any offer that changes price — bundles, quantity/volume breaks, BOGO, gift-with-purchase, spend-to-save — emit config.pricing instead of the legacy rules[]:
  config.pricing = { model: 'single'|'tiered'|'bogo'|'gift', mechanism, discount?|tiers?|bogo?|gift?, gate?, stacking? }
Set model and fill ONLY the matching body:
  single → discount = { kind, value, cheapestFreeCount?, priceEnding? }
  tiered → tiers = { basis: 'quantity'|'cart-value', rows: [ { threshold, discount, title?, subtitle?, badge?, highlighted?, preSelected? }, ... ] }  (rows MAY mix discount kinds — e.g. tier1 percentage, tier3 cheapest-free, tier4 fixed-price)
  bogo   → bogo = { buy:{productIds,collectionIds,quantity}, get:{productIds,collectionIds,quantity,discount}, showAsFree }
  gift   → gift = { productIds, threshold, basis, autoAdd, selectable }
Discount kinds (exactly these): percentage (value 0..100), fixed-amount, fixed-price, cheapest-free (set cheapestFreeCount), free-shipping, free-gift, none.
mechanism = 'shopify-function-discount' (default) unless the offer merges cart lines into ONE bundle line, then 'shopify-function-cart-transform'. Product/collection IDs must be Shopify GIDs (gid://shopify/Product/<id>, gid://shopify/Collection/<id>).
gate.minQuantity / gate.minSubtotal set thresholds; stacking.combinable sets whether it stacks with Shopify codes. Do NOT emit the legacy rules[] array when you emit pricing — pricing supersedes it. Omit config.pricing for offers that do not change price.`;

/** Types that pin the pricing pack and therefore get the pricing contract. */
const PRICING_TYPES: ReadonlySet<ModuleType> = new Set<ModuleType>([
  'functions.discountRules',
  'functions.cartTransform',
]);

/** Returns the full recipe schema spec for the given type (all Zod-level constraints as a string). */
export function getFullRecipeSchemaSpec(moduleType: ModuleType): string {
  const base = FULL_RECIPE_SCHEMA_SPECS[moduleType] ?? `Module type ${moduleType}: use type, name, category, requires, config (single object), and optionally style. No top-level settings, controls, assets, or meta.`;
  // R2.5 — append per-type enum lines (e.g. config.layout.layout) so the prose
  // fallback path (low-confidence / non-structured) also constrains the model to
  // this type's option-set. No-op for types without per-type enums.
  const typeEnumLines = describeTypeEnums(moduleType);
  const withEnums = typeEnumLines.length > 0 ? `${base}\n${typeEnumLines.join('\n')}` : base;
  // R2.1 — append the display-rules authoring contract on the types that pin the pack.
  const withRules = RULE_ENGINE_TYPES.has(moduleType) ? `${withEnums}\n${DISPLAY_RULES_SPEC}` : withEnums;
  // R2.2 — append the pricing authoring contract on the two Function types that pin the pack.
  return PRICING_TYPES.has(moduleType) ? `${withRules}\n${PRICING_SPEC}` : withRules;
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
  'theme.section': `Settings pack — theme.section (generic, build ANYTHING):
KIND: config.kind = short recommendation tag for the section ("hero", "faq", "lookbook", "feature-grid", "custom"). Recommendation only — never restrict the merchant's intent.
STRUCTURE (preferred): declare config.fieldSchema.fields = [{ name, type, label?, required?, options? }] for the section's own settings, and put initial values in config.fields. Use config.blocks for repeatable items (each { kind, text?, imageUrl?, url?, fields? }).
ESCAPE HATCH (only when needed): config.advancedCustom.customHtml / customCss-via-style.customCss / customJs for bespoke markup. It is sanitized + CSP-scoped; do not rely on external scripts.
ACTIVATION: config.activation = "section" (in-page), "global" (site-wide), or "overlay" (popup/modal behavior).
OVERLAY/POPUP (when activation="overlay", kind="popup"/"modal"): CONTENT title + body + ctaText; TRIGGER trigger (ON_LOAD/ON_EXIT_INTENT/TIMED…), delaySeconds, frequency (ONCE_PER_SESSION for most), showOnPages; CLOSE showCloseButton(true), autoCloseSeconds(0 unless auto-dismiss); urgency via countdownEnabled+countdownSeconds; secondaryCtaText for a dismiss link.
CONTACT FORM (when kind="contactForm"): CONTENT title, subtitle (opt), submitLabel, successMessage, errorMessage; FIELDS visibility + required toggles for name/email/phone/company/orderNumber/subject/message; PRIVACY consentRequired + consentLabel; SUBMISSION submissionMode (SHOPIFY_CONTACT native, APP_PROXY custom) + proxyEndpointPath when APP_PROXY; ANTI-SPAM spamProtection + honeypotFieldName (recommended HONEYPOT); OPS tags, includeCustomerContext, sendCopyToCustomer.
EFFECT (when kind="effect", activation="overlay"): effectKind (snowfall/confetti or other), intensity, speed; TIMING startTrigger (page_load/time_3s/scroll_25), durationSeconds (0 continuous or 5-30s burst); PLACEMENT overlayPlacement (full_screen/header_only/above_fold); ACCESSIBILITY reducedMotion must be true unless merchant asks otherwise.
FLOATING WIDGET (when kind="floatingWidget", activation="global"): VARIANT variant (whatsapp/chat/coupon/cart/scroll_top/custom), anchor (default bottom_right), onClick action; LABEL short clear label; URL/MESSAGE url (required for open_url/open_whatsapp — wa.me/... for WhatsApp) + message (prefilled chat text); POSITIONING offsetX/offsetY (default 24px); VISIBILITY hideOnMobile/hideOnDesktop; use layout.mode="floating", zIndex="overlay".
STYLE: set colors, typography, spacing, shape so the section looks intentional and on-brand; for overlays set layout anchor so each option looks visually distinct.`,

  'proxy.widget': `Settings pack — proxy.widget MUST include all of these:
REQUIRED: widgetId (unique lowercase-with-hyphens ID, descriptive — e.g. "loyalty-points-widget"), mode (HTML for rich content, JSON for data), title.
OPTIONAL: message (introductory text shown above the proxy-rendered content).
NOTE: proxy.widget uses APP_PROXY — content is rendered server-side; use theme.section with kind="floatingWidget" instead for floating buttons.`,
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

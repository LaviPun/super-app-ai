import type { ModuleType } from '@superapp/core';

const STYLE_SUMMARY = `Style (optional, storefront UI only): layout(mode:inline|overlay|sticky|floating, anchor:top|bottom|left|right|center, offsetX/Y:-100..100, width:auto|container|narrow|wide|full, zIndex:base|dropdown|sticky|overlay|modal), spacing(padding/margin/gap:none|tight|medium|loose), typography(size:XS|SM|MD|LG|XL|2XL, weight:normal|medium|bold, lineHeight:tight|normal|relaxed, align:left|center|right), colors(text/background/border/buttonBg/buttonText/overlayBackdrop:#hex, overlayBackdropOpacity:0-1), shape(radius:none|sm|md|lg|xl|full, borderWidth:none|thin|medium|thick, shadow:none|sm|md|lg), responsive(hideOnMobile/hideOnDesktop:bool), accessibility(focusVisible/reducedMotion:bool), customCss(string, max 2000).`;

/**
 * Compressed summary per module type — settings, controls, and styling.
 * Sent to the AI so it knows what fields and constraints are valid.
 * Each summary is ~150-200 tokens. Only the relevant type(s) are sent.
 */
export const MODULE_SUMMARIES: Record<ModuleType, string> = {
  'theme.section': `Module: theme.section | Category: STOREFRONT_UI | Requires: THEME_ASSETS
Generic, UNRESTRICTED storefront section / theme app extension — build ANY section, not a fixed type.
Settings: kind(str, free-form recommendation tag e.g. 'hero'|'faq'|'lookbook'|'custom'), activation('section'|'global'|'overlay'), title(str, opt), subtitle(str, opt), fieldSchema(declare typed settings), fields(values), blocks(repeatable content), advancedCustom(sanitized customHtml/customJs escape hatch), audience(opt), schedule(opt).
Controls: prefer declaring fieldSchema + fields for structured content; use blocks for repeatable items; use advancedCustom only for truly bespoke markup. kind is a recommendation, never a constraint.
Overlay/popup kinds (activation:'overlay', kind:'popup') add: title(str 1-60), body(str 0-240), ctaText/ctaUrl, secondaryCtaText/secondaryCtaUrl, trigger(ON_LOAD|ON_EXIT_INTENT|ON_SCROLL_25|ON_SCROLL_50|ON_SCROLL_75|ON_CLICK|TIMED), delaySeconds(0-300), frequency(EVERY_VISIT|ONCE_PER_SESSION|ONCE_PER_DAY|ONCE_PER_WEEK|ONCE_EVER), maxShowsPerDay(0-100), showOnPages(ALL|HOMEPAGE|COLLECTION|PRODUCT|CART|CUSTOM), customPageUrls(str[] max 20), autoCloseSeconds(0-300), showCloseButton(bool), countdownEnabled(bool), countdownSeconds(0-86400), countdownLabel(str max 40).
Contact-form kind (kind:'contactForm') adds: title(str 1-80), subtitle(opt), submitLabel(str 1-40), successMessage/errorMessage, field visibility(showName/showEmail/showPhone/showCompany/showOrderNumber/showSubject/showMessage) + required flags, consentRequired+consentLabel(max 120), submissionMode(SHOPIFY_CONTACT|APP_PROXY), proxyEndpointPath, sendCopyToCustomer, includeCustomerContext, spamProtection(NONE|HONEYPOT), honeypotFieldName, recipientEmail(opt), tags(opt), successRedirectUrl(opt).
Effect kind (kind:'effect', activation:'overlay') adds: effectKind(snowfall|confetti recommended — free-form), intensity(low|medium|high), speed(slow|normal|fast), startTrigger(page_load|scroll_25|time_3s|time_5s|time_10s), durationSeconds(0-300, 0=indefinite), overlayPlacement(full_screen|header_only|footer_only|above_fold), reducedMotion(bool — always true unless creative reason). Full-viewport decoration; no Shopify data.
Floating-widget kind (kind:'floatingWidget', activation:'global') adds: variant(whatsapp|chat|coupon|cart|scroll_top|custom), label(str 0-60), iconUrl(opt), anchor(bottom_right|bottom_left|top_right|top_left|bottom_center), offsetX/offsetY(-200..200), onClick(open_whatsapp|open_url|open_popup|open_drawer|scroll_top), message(prefilled WhatsApp/chat text), url(destination), hideOnMobile/hideOnDesktop(bool). Floating button/icon anchored to a corner.
${STYLE_SUMMARY}`,

  'proxy.widget': `Module: proxy.widget | Category: STOREFRONT_UI | Requires: APP_PROXY
Settings: widgetId(str, regex [a-z0-9-] 3-40), title(str 1-80), message(str 0-240, opt).
Controls: mode(JSON|HTML, default HTML).
${STYLE_SUMMARY}`,

  'functions.discountRules': `Module: functions.discountRules | Category: FUNCTION | Requires: DISCOUNT_FUNCTION
Settings: rules (array 1-50), each rule: when(customerTags:str[], minSubtotal:number>=0, skuIn:str[]), apply(percentageOff:0-100, fixedAmountOff:number>=0).
Controls: combineWithOtherDiscounts(bool, default true).
No style.`,

  'functions.deliveryCustomization': `Module: functions.deliveryCustomization | Category: FUNCTION | Requires: SHIPPING_FUNCTION
Settings: rules (array 1-50), each rule: when(countryCodeIn:str[2-char], minSubtotal:number>=0), actions(hideMethodsContaining:str[], renameMethod:{contains,to}, reorderPriority:int 0-100).
No style.`,

  'functions.paymentCustomization': `Module: functions.paymentCustomization | Category: FUNCTION | Requires: PAYMENT_CUSTOMIZATION_FUNCTION
Settings: rules (array 1-50), each rule: when(minSubtotal:number>=0, currencyIn:str[3-char]), actions(hideMethodsContaining:str[], renameMethod:{contains,to}, reorderPriority:int 0-100, requireReview:bool).
No style.`,

  'functions.cartAndCheckoutValidation': `Module: functions.cartAndCheckoutValidation | Category: FUNCTION | Requires: VALIDATION_FUNCTION
Settings: rules (array 1-50), each rule: when(maxQuantityPerSku:int>0, blockCountryCodes:str[2-char]), errorMessage(str 1-120).
No style.`,

  'functions.cartTransform': `Module: functions.cartTransform | Category: FUNCTION | Requires: CART_TRANSFORM_FUNCTION_UPDATE
Settings: bundles (array 1-50), each: title(str 1-60), componentSkus(str[] 2-20), bundleSku(str).
Controls: mode(BUNDLE|UNBUNDLE), fallbackTheme.enabled(bool), fallbackTheme.notificationMessage(str 1-140).
No style.`,

  'functions.fulfillmentConstraints': `Module: functions.fulfillmentConstraints | Category: FUNCTION
Settings: rules (array 1-50), each: when(productTagIn:str[], skuIn:str[]), apply(shipAlone:bool, groupWithTag:str). Split fragile items or force ship-alone.
No style.`,

  'functions.orderRoutingLocationRule': `Module: functions.orderRoutingLocationRule | Category: FUNCTION
Settings: rules (array 1-50), each: when(inventoryLocationIds:str[], countryCode:str[2]), apply(preferLocationId:str, priority:int 0-100). Prefer warehouse by location/stock.
No style.`,

  'functions.shippingDiscount': `Module: functions.shippingDiscount | Category: FUNCTION | Requires: SHIPPING_FUNCTION
Waives or discounts SHIPPING/delivery cost (free or discounted delivery). This is the ONLY module type that can change shipping cost — functions.deliveryCustomization only renames/reorders/hides options; functions.discountRules cannot discount shipping. Use this for "free shipping over $X", "free delivery to US/CA", etc.
Settings: rules (array 1-50), each rule: when(minSubtotal:number>=0, minQty:int>0, countryCodeIn:str[2-char], customerTags:str[]), apply(shippingPercentage:0-100 — 100=free shipping, partial=discounted delivery).
No style.`,

  'checkout.upsell': `Module: checkout.upsell | Category: STOREFRONT_UI | Requires: CHECKOUT_UI_INFO_SHIP_PAY
Settings: offerTitle(str 1-60), productVariantGid(str min 10, e.g. gid://shopify/ProductVariant/123), discountPercent(0-100, default 0).
No style.`,

  'checkout.block': `Module: checkout.block | Category: STOREFRONT_UI | Requires: CHECKOUT_UI_INFO_SHIP_PAY
Settings: target(enum from CHECKOUT_UI_TARGETS), title(str 1-80), message(str 0-240, opt), productVariantGid(str, opt).
Interactive fields[] (opt): {kind(text|textarea|checkbox|choice-list|select|email|number), key, label, placeholder?, required?, options?[{value,label}], write?{to(attribute|note|metafield), namespace?, metafieldKey?}}. Fields capture buyer input and write to cart on checkout targets; read-only on thank-you.
Layout[] (opt): {kind(banner|progress-bar|trust-badges|payment-icons|countdown|testimonial|divider), text?, tone?(auto|info|success|warning|critical), value?(0-1 for progress), badges?[str], icons?[payment icon names], endsAt?(ISO), attribution?}.
protectedData (opt): none|level1|level2 — declares the customer-data access the block needs (level1=id/orderCount, level2=name/email/phone/address); requires app-level access grant to populate.
Merchant-placeable block in checkout. No style.`,

  'postPurchase.offer': `Module: postPurchase.offer | Category: STOREFRONT_UI | Requires: CHECKOUT_UI_INFO_SHIP_PAY
Settings: offerTitle(str 1-80), productVariantGid(str, opt), message(str 0-240, opt). One-click upsell after payment.
No style.`,

  'admin.action': `Module: admin.action | Category: ADMIN_UI
Settings: target(enum from ADMIN_TARGETS), label(str 1-80), shouldRender(bool, opt). Admin action modal on resource pages.
No style.`,

  'admin.block': `Module: admin.block | Category: ADMIN_UI
Settings: target(enum from ADMIN_TARGETS), label(str 1-80), shouldRender(bool, opt). Admin block on resource pages.
No style.`,

  'admin.discountUi': `Module: admin.discountUi | Category: ADMIN_UI
Settings: title(str 1-80), discountClass(product|order|shipping), functionHandle(str, opt — links a functions.discountRules Function), description(str, opt), fields([{key,label,kind:text|number|toggle|select}], opt). Spring 2026 Discount UI Extension — an admin form that configures a discount.
No style.`,

  'pos.extension': `Module: pos.extension | Category: ADMIN_UI
Settings: target(enum from POS_TARGETS), label(str 1-80), blockKind(tile|modal|block|action, opt). POS UI extension.
No style.`,

  'analytics.pixel': `Module: analytics.pixel | Category: INTEGRATION
Settings: events(array of PIXEL_STANDARD_EVENTS, min 1), pixelId(str max 80, opt), mapping(record, opt). Web pixel event subscriptions.
No style.`,

  'integration.httpSync': `Module: integration.httpSync | Category: INTEGRATION
Settings: connectorId(str), endpointPath(str regex /path), payloadMapping(record str->str).
Controls: trigger(MANUAL|SHOPIFY_WEBHOOK_ORDER_CREATED|SHOPIFY_WEBHOOK_PRODUCT_UPDATED|SHOPIFY_WEBHOOK_CUSTOMER_CREATED|SHOPIFY_WEBHOOK_FULFILLMENT_CREATED|SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED|SHOPIFY_WEBHOOK_COLLECTION_CREATED|SCHEDULED).
No style.`,

  'flow.automation': `Module: flow.automation | Category: FLOW
Controls: trigger(MANUAL|SHOPIFY_WEBHOOK_ORDER_CREATED|SHOPIFY_WEBHOOK_PRODUCT_UPDATED|SHOPIFY_WEBHOOK_CUSTOMER_CREATED|SHOPIFY_WEBHOOK_FULFILLMENT_CREATED|SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED|SHOPIFY_WEBHOOK_COLLECTION_CREATED|SCHEDULED|SUPERAPP_MODULE_PUBLISHED|SUPERAPP_CONNECTOR_SYNCED|SUPERAPP_DATA_RECORD_CREATED|SUPERAPP_WORKFLOW_COMPLETED|SUPERAPP_WORKFLOW_FAILED).
Steps (array 1-40, discriminated by kind): HTTP_REQUEST(connectorId, path, method, bodyMapping), SEND_HTTP_REQUEST(url https, method, headers, body, authType, authConfig), TAG_CUSTOMER(tag), ADD_ORDER_NOTE(note), WRITE_TO_STORE(storeKey, titleExpr, payloadMapping), SEND_EMAIL_NOTIFICATION(to, subject, body), TAG_ORDER(tags), SEND_SLACK_MESSAGE(channel, text), CONDITION(field, operator, value, thenSteps, elseSteps).
No style.`,

  'messaging.campaign': `Module: messaging.campaign | Category: INTEGRATION
First-class MESSAGING surface — bounded email/slack fan-out over a resolved audience. Use for "email my back-in-stock list", "notify subscribers when X restocks", broadcast blasts, order/customer notifications.
Settings: channel(email|sms|push|slack — ONLY email+slack send today; sms/push are modeled but need their connector shipped, so a campaign whose channel is sms/push is authorable+previewable but blocked at publish). trigger({kind:broadcast|event|back_in_stock, event?:<flow trigger> when kind=event}). audience({source:data_store|event_recipient|literal, storeKey?(data_store: subscriber list key), addressField?(default email→'email'), consentField?(skip falsy-consent recipients), recipients?(literal), ruleEngine?(per-recipient filter)}). templates(1-4, each {channel, subject?(email requires it), body(HTML/text, {{merge.vars}} allowed), title?(push), url?}). batchSize(1-500, default 200 — bounded per run; large lists page across runs). respectConsent(bool, default true).
Merge vars: {{record.<field>}} / {{event.<path>}} resolved per recipient at send time.
No style.`,

  'agentic.catalogProfile': `Module: agentic.catalogProfile | Category: INTEGRATION
AGENTIC-COMMERCE surface — a structured product-data feed the merchant surfaces to AI channels (ChatGPT/Copilot/Perplexity shopping, AI agents). Use for "make my catalog discoverable in AI shopping", "optimize my products for AI channels", "AI product feed". Published, it is served at GET /agentic/{shop}/{feedHandle}/feed.json (an app-served read-only feed — the SAME model pos.extension uses; no metaobject, no Shopify write). Only PUBLIC product data (title/price/availability/images/mapped attributes) — no PII.
Settings: artifacts(1+ of catalog-feed|attribute-map|compliance-disclosure — REAL today; mcp-endpoint|agent-profile|sponsored-products — modeled but NEEDS_RUNTIME: accepted, but a module requesting them publishes only the feed and names them as deferred, never faked). source({kind:all|collection|manual, collectionIds?(Collection GIDs, max 25), productIds?(Product GIDs, max 250)}). attributeMap(max 50, each {key:gtin|mpn|brand|size|color|material|gender|ageGroup|condition, from:"metafield:<ns>.<key>"|"vendor"|"productType"|"variant.<field>"} — unresolved keys are omitted). disclosures(max 20, each {label(str 1-80), text(str 1-500)} appended to every feed item). feedHandle(str, regex [a-z0-9-] 3-40, default 'catalog').
No style.`,

  'platform.extensionBlueprint': `Module: platform.extensionBlueprint | Category: ADMIN_UI
Settings: surface(CHECKOUT_UI|THEME_APP_EXTENSION|FUNCTION), goal(str 5-240), suggestedFiles(str[] 1-50).
No style.`,

  'customerAccount.blocks': `Module: customerAccount.blocks | Category: CUSTOMER_ACCOUNT | Requires: CUSTOMER_ACCOUNT_UI
Settings: target(customer-account.order-status.block.render|customer-account.order-index.block.render|customer-account.profile.block.render|customer-account.page.render), title(str 1-80), blocks(array 1-20, each: kind(TEXT|LINK|BADGE|DIVIDER), content(str 0-240, opt), url(url, opt), tone(info|success|warning|critical, opt)).
Controls: b2bOnly(bool, default false).
No style.`,
};

/** Get the compressed summary for a single module type. */
export function getModuleSummary(type: ModuleType): string {
  return MODULE_SUMMARIES[type] ?? '';
}

/** Get a combined summary listing all available module types (for classification stage). */
export function getAllTypesSummary(): string {
  const lines = Object.entries(MODULE_SUMMARIES).map(
    ([type, summary]) => {
      const firstLine = summary.split('\n')[0] ?? '';
      return `- ${type}: ${firstLine.replace(/^Module:\s*\S+\s*\|\s*/, '')}`;
    },
  );
  return `Available module types:\n${lines.join('\n')}`;
}

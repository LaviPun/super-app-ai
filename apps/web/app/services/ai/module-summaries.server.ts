import type { ModuleType } from '@superapp/core';

const STYLE_SUMMARY = `Style (optional, storefront UI only): layout(mode:inline|overlay|sticky|floating, anchor:top|bottom|left|right|center, offsetX/Y:-100..100, width:auto|container|narrow|wide|full, zIndex:base|dropdown|sticky|overlay|modal), spacing(padding/margin/gap:none|tight|medium|loose), typography(size:XS|SM|MD|LG|XL|2XL, weight:normal|medium|bold, lineHeight:tight|normal|relaxed, align:left|center|right), colors(text/background/border/buttonBg/buttonText/overlayBackdrop:#hex, overlayBackdropOpacity:0-1), shape(radius:none|sm|md|lg|xl|full, borderWidth:none|thin|medium|thick, shadow:none|sm|md|lg), responsive(hideOnMobile/hideOnDesktop:bool), accessibility(focusVisible/reducedMotion:bool), customCss(string, max 2000).`;

/**
 * Compressed summary per module type — settings, controls, and styling.
 * Sent to the AI so it knows what fields and constraints are valid.
 * Each summary is ~150-200 tokens. Only the relevant type(s) are sent.
 */
export const MODULE_SUMMARIES: Record<ModuleType, string> = {
  'theme.banner': `Module: theme.banner | Category: STOREFRONT_UI | Requires: THEME_ASSETS
Settings: heading(str 1-80), subheading(str 0-200, opt), ctaText(str 0-40, opt), ctaUrl(url, opt), imageUrl(url, opt), enableAnimation(bool, default false).
Controls: enableAnimation toggles entrance animation.
${STYLE_SUMMARY}`,

  'theme.popup': `Module: theme.popup | Category: STOREFRONT_UI | Requires: THEME_ASSETS
Settings: title(str 1-60), body(str 0-240, opt), ctaText(str 0-40, opt), ctaUrl(url, opt), secondaryCtaText(str max 40, opt), secondaryCtaUrl(url, opt).
Controls: trigger(ON_LOAD|ON_EXIT_INTENT|ON_SCROLL_25|ON_SCROLL_50|ON_SCROLL_75|ON_CLICK|TIMED), delaySeconds(int 0-300), frequency(EVERY_VISIT|ONCE_PER_SESSION|ONCE_PER_DAY|ONCE_PER_WEEK|ONCE_EVER), maxShowsPerDay(int 0-100), showOnPages(ALL|HOMEPAGE|COLLECTION|PRODUCT|CART|CUSTOM), customPageUrls(array str max 20), autoCloseSeconds(int 0-300), showCloseButton(bool), countdownEnabled(bool), countdownSeconds(int 0-86400), countdownLabel(str max 40).
${STYLE_SUMMARY}`,

  'theme.notificationBar': `Module: theme.notificationBar | Category: STOREFRONT_UI | Requires: THEME_ASSETS
Settings: message(str 1-140), linkText(str 0-40, opt), linkUrl(url, opt).
Controls: dismissible(bool, default true).
${STYLE_SUMMARY}`,

  'theme.contactForm': `Module: theme.contactForm | Category: STOREFRONT_UI | Requires: THEME_ASSETS
Settings: title(str 1-80), subtitle(str 0-200, opt), submitLabel(str 1-40), successMessage(str 1-200), errorMessage(str 1-200), recipientEmail(email, opt), tags(str[] max 20, opt), successRedirectUrl(url, opt).
Controls: field visibility(showName/showEmail/showPhone/showCompany/showOrderNumber/showSubject/showMessage), required flags(nameRequired/emailRequired/phoneRequired/companyRequired/orderNumberRequired/subjectRequired/messageRequired), consentRequired + consentLabel(max 120), submissionMode(SHOPIFY_CONTACT|APP_PROXY), proxyEndpointPath(path), sendCopyToCustomer(bool), includeCustomerContext(bool), spamProtection(NONE|HONEYPOT), honeypotFieldName(str 1-40).
${STYLE_SUMMARY}`,

  'theme.effect': `Module: theme.effect | Category: STOREFRONT_UI | Requires: THEME_ASSETS
Settings: effectKind(snowfall|confetti, required), intensity(low|medium|high, default medium), speed(slow|normal|fast, default normal), startTrigger(page_load|scroll_25|time_3s|time_5s|time_10s, default page_load), durationSeconds(int 0-300, 0=indefinite, default 0), overlayPlacement(full_screen|header_only|footer_only|above_fold, default full_screen), reducedMotion(bool, default true — always set true unless creative reason).
Controls: full-viewport decoration overlay; no Shopify data. Use for seasonal effects (snowfall, confetti). Always set reducedMotion:true unless merchant explicitly asks for it off.
${STYLE_SUMMARY}`,

  'theme.floatingWidget': `Module: theme.floatingWidget | Category: STOREFRONT_UI | Requires: THEME_ASSETS
Settings: variant(whatsapp|chat|coupon|cart|scroll_top|custom, required), label(str 0-60, opt), iconUrl(url, opt), anchor(bottom_right|bottom_left|top_right|top_left|bottom_center, default bottom_right), offsetX(int -200..200, default 24), offsetY(int -200..200, default 24), onClick(open_whatsapp|open_url|open_popup|open_drawer|scroll_top, default open_url), message(str 0-500, opt — prefilled text for WhatsApp/chat), url(url, opt — destination for open_url/open_whatsapp), hideOnMobile(bool, default false), hideOnDesktop(bool, default false).
Controls: floating button/icon anchored to a corner. WhatsApp variant opens wa.me link; chat opens drawer; scroll_top scrolls to top.
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

  'checkout.upsell': `Module: checkout.upsell | Category: STOREFRONT_UI | Requires: CHECKOUT_UI_INFO_SHIP_PAY
Settings: offerTitle(str 1-60), productVariantGid(str min 10, e.g. gid://shopify/ProductVariant/123), discountPercent(0-100, default 0).
No style.`,

  'checkout.block': `Module: checkout.block | Category: STOREFRONT_UI | Requires: CHECKOUT_UI_INFO_SHIP_PAY
Settings: target(enum from CHECKOUT_UI_TARGETS), title(str 1-80), message(str 0-240, opt), productVariantGid(str, opt). Merchant-placeable block in checkout.
No style.`,

  'postPurchase.offer': `Module: postPurchase.offer | Category: STOREFRONT_UI | Requires: CHECKOUT_UI_INFO_SHIP_PAY
Settings: offerTitle(str 1-80), productVariantGid(str, opt), message(str 0-240, opt). One-click upsell after payment.
No style.`,

  'admin.action': `Module: admin.action | Category: ADMIN_UI
Settings: target(enum from ADMIN_TARGETS), label(str 1-80), shouldRender(bool, opt). Admin action modal on resource pages.
No style.`,

  'admin.block': `Module: admin.block | Category: ADMIN_UI
Settings: target(enum from ADMIN_TARGETS), label(str 1-80), shouldRender(bool, opt). Admin block on resource pages.
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

/**
 * Allowed Values Manifest — single source of truth for all finite enums and limits.
 * Source: docs/ai-module-main-doc.md Section 4 (Canonical value sets) + Section 14.
 * No ad-hoc strings for Shopify-facing identifiers; generator must use only these values.
 */

// ─── 4.2.2A Liquid template.name values (reference only; doc 4.2.2A) ──────────
/** All Liquid template.name values. Non-placeable (customers/*, gift_card) excluded from placement picker. */
export const THEME_LIQUID_TEMPLATE_NAMES = [
  '404',
  'article',
  'blog',
  'cart',
  'collection',
  'list-collections',
  'customers/account',
  'customers/activate_account',
  'customers/addresses',
  'customers/login',
  'customers/order',
  'customers/register',
  'customers/reset_password',
  'gift_card',
  'index',
  'page',
  'password',
  'product',
  'search',
] as const;

// ─── 4.2.2B Theme App Block placement templates (OS 2.0 only) ─────────────────
/** Placeable templates for Theme App Blocks. Excludes customers/*, gift_card, robots.txt. */
export const THEME_PLACEABLE_TEMPLATES = [
  '404',
  'article',
  'blog',
  'cart',
  'collection',
  'list-collections',
  'index',
  'page',
  'password',
  'product',
  'search',
] as const;
/** Pattern for metaobject templates: metaobject/<type> e.g. metaobject/book */
export const THEME_METAOBJECT_TEMPLATE_PREFIX = 'metaobject';

// ─── 4.2.3 Section group types ─────────────────────────────────────────────────
export const THEME_SECTION_GROUPS = ['header', 'footer', 'aside', '*'] as const;
/** custom.<NAME> — NAME is unlimited; use this for validation pattern */
export const THEME_SECTION_GROUP_CUSTOM_PREFIX = 'custom.';

// ─── 4.2.4 Theme Editor deep-link target modes ─────────────────────────────────
export const THEME_DEEP_LINK_MODES = [
  'newAppsSection',
  'sectionGroup:header',
  'sectionGroup:footer',
  'sectionGroup:aside',
  'mainSection',
  'sectionId',
] as const;

// ─── 4.2.5 Theme setting input types (32 total) ────────────────────────────────
const THEME_SETTING_BASIC = ['checkbox', 'number', 'radio', 'range', 'select', 'text', 'textarea'] as const;
const THEME_SETTING_SPECIALIZED = [
  'article',
  'article_list',
  'blog',
  'collection',
  'collection_list',
  'color',
  'color_background',
  'color_scheme',
  'color_scheme_group',
  'font_picker',
  'html',
  'image_picker',
  'inline_richtext',
  'link_list',
  'liquid',
  'metaobject',
  'metaobject_list',
  'page',
  'product',
  'product_list',
  'richtext',
  'text_alignment',
  'url',
  'video',
  'video_url',
] as const;
export const THEME_SETTING_TYPES = [...THEME_SETTING_BASIC, ...THEME_SETTING_SPECIALIZED] as const;
/** App block/embed schema knobs (finite keys generator may use) */
export const THEME_SCHEMA_KNOBS = [
  'name',
  'target',
  'settings',
  'javascript',
  'stylesheet',
  'tag',
  'class',
  'default',
  'available_if',
  'enabled_on',
  'disabled_on',
] as const;

// ─── 4.2.1 Theme embed targets ────────────────────────────────────────────────
export const THEME_EMBED_TARGETS = ['head', 'compliance_head', 'body'] as const;
export const THEME_BLOCK_TARGET = 'section';

// ─── 4.3.1 Checkout UI target enum (complete) ──────────────────────────────────
export const CHECKOUT_UI_TARGETS = [
  'purchase.address-autocomplete.suggest',
  'purchase.address-autocomplete.format-suggestion',
  'purchase.thank-you.announcement.render',
  'purchase.checkout.block.render',
  'purchase.thank-you.block.render',
  'purchase.checkout.footer.render-after',
  'purchase.thank-you.footer.render-after',
  'purchase.checkout.header.render-after',
  'purchase.thank-you.header.render-after',
  'purchase.checkout.contact.render-after',
  'purchase.thank-you.customer-information.render-after',
  'purchase.checkout.pickup-location-list.render-before',
  'purchase.checkout.pickup-location-list.render-after',
  'purchase.checkout.pickup-location-option-item.render-after',
  'purchase.checkout.actions.render-before',
  'purchase.checkout.cart-line-item.render-after',
  'purchase.checkout.cart-line-list.render-after',
  'purchase.checkout.reductions.render-before',
  'purchase.checkout.reductions.render-after',
  'purchase.thank-you.cart-line-item.render-after',
  'purchase.thank-you.cart-line-list.render-after',
  'purchase.checkout.payment-method-list.render-before',
  'purchase.checkout.payment-method-list.render-after',
  'purchase.checkout.pickup-point-list.render-before',
  'purchase.checkout.pickup-point-list.render-after',
  'purchase.checkout.delivery-address.render-before',
  'purchase.checkout.delivery-address.render-after',
  'purchase.checkout.shipping-option-item.details.render',
  'purchase.checkout.shipping-option-item.render-after',
  'purchase.checkout.shipping-option-list.render-before',
  'purchase.checkout.shipping-option-list.render-after',
] as const;
/** Checkout-step targets (info/shipping/payment) require Shopify Plus */
export const CHECKOUT_UI_PLUS_ONLY_TARGET_PREFIXES = [
  'purchase.checkout.contact.',
  'purchase.checkout.delivery-address.',
  'purchase.checkout.shipping-option',
  'purchase.checkout.payment-method',
  'purchase.checkout.actions.',
  'purchase.checkout.pickup-location',
  'purchase.checkout.pickup-point',
  'purchase.checkout.reductions.',
  'purchase.checkout.cart-line',
  'purchase.checkout.block.',
  'purchase.checkout.footer.',
  'purchase.checkout.header.',
];

// ─── 4.6.1 Admin surface enum (doc 4.6.1) ────────────────────────────────────
export const ADMIN_SURFACE_KINDS = [
  'Admin actions',
  'Admin blocks',
  'Product configuration',
  'Admin link extensions',
  'Discount function settings',
  'Navigation links',
  'Purchase options extensions',
  'Subscription link',
] as const;

// ─── 21.7.1 Recipe block types (taxonomy) ────────────────────────────────────
export const RECIPE_BLOCK_TYPES = [
  'THM-BLK',
  'THM-EMB',
  'CO-UI',
  'TY-UI',
  'ACC',
  'ADM',
  'POS',
  'FUNC',
  'PIX',
  'FLOW',
  'ADM-LINK',
  'PO-EXT',
  'SUB-LINK',
  'PAY-EXT',
] as const;
/** Recipe intents (21.7.1). */
export const RECIPE_INTENTS = ['ui_widget', 'logic_change', 'tracking', 'automation'] as const;
/** Recipe surfaces for taxonomy (21.7.1). */
export const RECIPE_SURFACES = [
  'theme',
  'checkout_ui',
  'thank_you',
  'customer_accounts',
  'admin',
  'pos',
  'functions',
  'pixels',
  'flow',
  'purchase_options',
  'subscription_link',
  'payments',
] as const;

// ─── 18.4 customerAccount.blocks config.target (subset of CUSTOMER_ACCOUNT_TARGETS) ─
export const CUSTOMER_ACCOUNT_BLOCK_TARGETS = [
  'customer-account.order-status.block.render',
  'customer-account.order-index.block.render',
  'customer-account.profile.block.render',
  'customer-account.page.render',
] as const;

// ─── 4.5.1 Customer account UI target enum ────────────────────────────────────
export const CUSTOMER_ACCOUNT_TARGETS = [
  'customer-account.footer.render-after',
  'customer-account.page.render',
  'customer-account.order.page.render',
  'customer-account.order.action.menu-item.render',
  'customer-account.order.action.render',
  'customer-account.order-index.announcement.render',
  'customer-account.order-index.block.render',
  'customer-account.order-status.announcement.render',
  'customer-account.order-status.block.render',
  'customer-account.order-status.cart-line-item.render-after',
  'customer-account.order-status.cart-line-list.render-after',
  'customer-account.order-status.customer-information.render-after',
  'customer-account.order-status.fulfillment-details.render-after',
  'customer-account.order-status.payment-details.render-after',
  'customer-account.order-status.return-details.render-after',
  'customer-account.order-status.unfulfilled-items.render-after',
  'customer-account.profile.company-details.render-after',
  'customer-account.profile.company-location-addresses.render-after',
  'customer-account.profile.company-location-payment.render-after',
  'customer-account.profile.company-location-staff.render-after',
  'customer-account.profile.addresses.render-after',
  'customer-account.profile.announcement.render',
  'customer-account.profile.block.render',
] as const;

// ─── 4.6.2 Admin target enum (Actions, Blocks, Print, Segmentation, etc.) ──────
export const ADMIN_ACTION_TARGETS = [
  'admin.abandoned-checkout-details.action.render',
  'admin.catalog-details.action.render',
  'admin.collection-details.action.render',
  'admin.collection-index.action.render',
  'admin.company-details.action.render',
  'admin.customer-details.action.render',
  'admin.customer-index.action.render',
  'admin.customer-index.selection-action.render',
  'admin.customer-segment-details.action.render',
  'admin.discount-details.action.render',
  'admin.discount-index.action.render',
  'admin.draft-order-details.action.render',
  'admin.draft-order-index.action.render',
  'admin.draft-order-index.selection-action.render',
  'admin.gift-card-details.action.render',
  'admin.order-details.action.render',
  'admin.order-fulfilled-card.action.render',
  'admin.order-index.action.render',
  'admin.order-index.selection-action.render',
  'admin.product-details.action.render',
  'admin.product-index.action.render',
  'admin.product-index.selection-action.render',
  'admin.product-variant-details.action.render',
  'admin.product-purchase-option.action.render',
  'admin.product-variant-purchase-option.action.render',
] as const;
export const ADMIN_BLOCK_TARGETS = [
  'admin.abandoned-checkout-details.block.render',
  'admin.catalog-details.block.render',
  'admin.collection-details.block.render',
  'admin.company-details.block.render',
  'admin.company-location-details.block.render',
  'admin.customer-details.block.render',
  'admin.draft-order-details.block.render',
  'admin.gift-card-details.block.render',
  'admin.discount-details.function-settings.render',
  'admin.order-details.block.render',
  'admin.product-details.block.render',
  'admin.product-variant-details.block.render',
] as const;
const ADMIN_PRINT_TARGETS = [
  'admin.order-details.print-action.render',
  'admin.product-details.print-action.render',
  'admin.order-index.selection-print-action.render',
  'admin.product-index.selection-print-action.render',
] as const;
export const ADMIN_TARGETS = [
  ...ADMIN_ACTION_TARGETS,
  ...ADMIN_BLOCK_TARGETS,
  ...ADMIN_PRINT_TARGETS,
  'admin.customers.segmentation-templates.render',
  'admin.product-details.configuration.render',
  'admin.product-variant-details.configuration.render',
  'admin.settings.validation.render',
] as const;

// ─── 4.7 POS UI targets ──────────────────────────────────────────────────────
export const POS_TARGETS = [
  'pos.home.tile.render',
  'pos.home.modal.render',
  'pos.cart.line-item-details.action.menu-item.render',
  'pos.cart.line-item-details.action.render',
  'pos.customer-details.block.render',
  'pos.customer-details.action.menu-item.render',
  'pos.customer-details.action.render',
  'pos.draft-order-details.block.render',
  'pos.draft-order-details.action.menu-item.render',
  'pos.draft-order-details.action.render',
  'pos.order-details.block.render',
  'pos.order-details.action.menu-item.render',
  'pos.order-details.action.render',
  'pos.exchange.post.block.render',
  'pos.exchange.post.action.menu-item.render',
  'pos.exchange.post.action.render',
  'pos.purchase.post.block.render',
  'pos.purchase.post.action.menu-item.render',
  'pos.purchase.post.action.render',
  'pos.return.post.block.render',
  'pos.return.post.action.menu-item.render',
  'pos.return.post.action.render',
  'pos.product-details.block.render',
  'pos.product-details.action.menu-item.render',
  'pos.product-details.action.render',
  'pos.receipt-header.block.render',
  'pos.receipt-footer.block.render',
  'pos.register-details.block.render',
  'pos.register-details.action.menu-item.render',
  'pos.register-details.action.render',
] as const;

// ─── 4.4 Post-purchase extension targets (doc 4.4) ──────────────────────────
/** Post-purchase API targets (ShouldRender / Render). */
export const POST_PURCHASE_TARGETS = [
  'Checkout::PostPurchase::ShouldRender',
  'Checkout::PostPurchase::Render',
] as const;

// ─── 4.2.6 Section schema attributes (Shopify; doc 4.2.6) ─────────────────────
/** Section schema keys the generator may use. */
export const THEME_SECTION_SCHEMA_ATTRIBUTES = [
  'name',
  'tag',
  'class',
  'limit',
  'settings',
  'blocks',
  'max_blocks',
  'presets',
  'default',
  'locales',
  'enabled_on',
  'disabled_on',
] as const;

// ─── 4.8 Function API enum ───────────────────────────────────────────────────
export const FUNCTION_APIS = [
  'cart_transform',
  'discount',
  'delivery_customization',
  'payment_customization',
  'cart_and_checkout_validation',
  'fulfillment_constraints',
  'order_routing_location_rule',
] as const;
/** Stable run targets for Shopify Functions (doc 4.2.9). Delivery/Payment/Validation use API-specific run targets. */
export const FUNCTION_RUN_TARGETS = [
  'cart.transform.run',
  'cart.lines.discounts.generate.run',
  'cart.delivery-options.discounts.generate.run',
  'cart.fulfillment-constraints.generate.run',
] as const;

// ─── 4.9 Web pixel standard events ────────────────────────────────────────────
export const PIXEL_STANDARD_EVENTS = [
  'alert_displayed',
  'cart_viewed',
  'checkout_address_info_submitted',
  'checkout_completed',
  'checkout_contact_info_submitted',
  'checkout_shipping_info_submitted',
  'checkout_started',
  'collection_viewed',
  'page_viewed',
  'payment_info_submitted',
  'product_added_to_cart',
  'product_removed_from_cart',
  'product_viewed',
  'search_submitted',
  'ui_extension_errored',
] as const;

// ─── 4.10 Flow extension kinds ─────────────────────────────────────────────────
export const FLOW_EXTENSION_KINDS = ['flow.trigger', 'flow.action', 'flow.template', 'flow.lifecycle_event'] as const;

// ─── RecipeSpec config enums (doc 18) ─────────────────────────────────────────
/** theme.section overlay/popup trigger (doc 18.1). */
export const POPUP_TRIGGERS = [
  'ON_LOAD',
  'ON_EXIT_INTENT',
  'ON_SCROLL_25',
  'ON_SCROLL_50',
  'ON_SCROLL_75',
  'ON_CLICK',
  'TIMED',
] as const;
/** theme.section overlay/popup frequency (doc 18.1). */
export const POPUP_FREQUENCY = [
  'EVERY_VISIT',
  'ONCE_PER_SESSION',
  'ONCE_PER_DAY',
  'ONCE_PER_WEEK',
  'ONCE_EVER',
] as const;
/** theme.section overlay/popup showOnPages (doc 18.1). */
export const POPUP_SHOW_ON_PAGES = ['ALL', 'HOMEPAGE', 'COLLECTION', 'PRODUCT', 'CART', 'CUSTOM'] as const;

/** integration.httpSync + flow.automation base triggers (doc 18.2, 18.3). */
export const INTEGRATION_HTTP_SYNC_TRIGGERS = [
  'MANUAL',
  'SHOPIFY_WEBHOOK_ORDER_CREATED',
  'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
  'SHOPIFY_WEBHOOK_CUSTOMER_CREATED',
  'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED',
  'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED',
  'SHOPIFY_WEBHOOK_COLLECTION_CREATED',
  'SCHEDULED',
] as const;
/** flow.automation extra triggers (doc 18.3). */
export const FLOW_SUPERAPP_TRIGGERS = [
  'SUPERAPP_MODULE_PUBLISHED',
  'SUPERAPP_CONNECTOR_SYNCED',
  'SUPERAPP_DATA_RECORD_CREATED',
  'SUPERAPP_WORKFLOW_COMPLETED',
  'SUPERAPP_WORKFLOW_FAILED',
] as const;
/** flow.automation RecipeSpec config trigger enum (doc 18.3). */
export const FLOW_AUTOMATION_TRIGGERS = [...INTEGRATION_HTTP_SYNC_TRIGGERS, ...FLOW_SUPERAPP_TRIGGERS] as const;

// ─── Messaging surface (R3.4 / M5, specs/031 messaging-surface.md) ───────────
/**
 * Delivery channels. Only `email` and `slack` have a shipped runtime today
 * (EmailConnector / SlackConnector, reachable via the live FlowRunnerService step
 * kinds SEND_EMAIL_NOTIFICATION / SEND_SLACK_MESSAGE). `sms` and `push` are
 * modeled in the vocabulary but gated `needs_runtime` at compile + runtime until
 * their connectors ship — the runner refuses them loudly, never fakes a send.
 */
export const MESSAGING_CHANNELS = ['email', 'sms', 'push', 'slack'] as const;
export type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

/**
 * Channels whose runtime is ACTUALLY shipped today. Single source of truth for the
 * compiler preflight gate + the MessagingRunnerService channel gate. When a Twilio
 * (sms) / web-push (push) connector lands, add the channel here — no schema or
 * runner change; the gate simply stops throwing.
 */
export const MESSAGING_CHANNELS_SHIPPED = ['email', 'slack'] as const;
export type ShippedMessagingChannel = (typeof MESSAGING_CHANNELS_SHIPPED)[number];

/**
 * What causes the campaign to fan out.
 *  - `broadcast`     one-shot blast to the resolved audience (admin "Send now" / SCHEDULED cron).
 *  - `event`         reacts to a live FlowRunnerService trigger (order/create, product/update, …).
 *  - `back_in_stock` event convenience preset: resolves to SHOPIFY_WEBHOOK_PRODUCT_UPDATED → notify a waitlist store.
 * Durable multi-step drip sequences are OUT OF SCOPE — they depend on the R3.5
 * durable scheduler (cross-run paging); modeled as a follow-up, not shipped here.
 */
export const MESSAGING_TRIGGER_KINDS = ['broadcast', 'event', 'back_in_stock'] as const;
export type MessagingTriggerKind = (typeof MESSAGING_TRIGGER_KINDS)[number];

/** How the recipient set is resolved. */
export const MESSAGING_AUDIENCE_SOURCES = [
  'data_store', // a DataStore subscriber list (the capture→persist→fan-out spine)
  'event_recipient', // the person on the triggering event (order email, back-in-stock subscriber)
  'literal', // an explicit address list (ops alerts; small)
] as const;
export type MessagingAudienceSource = (typeof MESSAGING_AUDIENCE_SOURCES)[number];

/** Bounds for the messaging pack (schema-enforced). */
export const MESSAGING_LIMITS = {
  subjectMax: 200,
  bodyMax: 20_000,
  titleMax: 120,
  literalRecipientsMax: 50,
  templatesMax: 4, // one per channel
  batchSizeMax: 500, // per-run fan-out cap (bounded posture; cross-run paging is R3.5)
  fieldNameMax: 60,
  storeKeyMax: 40,
} as const;

/** flow.automation steps kind (doc 18.3). */
export const FLOW_STEP_KINDS = [
  'HTTP_REQUEST',
  'SEND_HTTP_REQUEST',
  'TAG_CUSTOMER',
  'ADD_ORDER_NOTE',
  'WRITE_TO_STORE',
  'SEND_EMAIL_NOTIFICATION',
  'TAG_ORDER',
  'SEND_SLACK_MESSAGE',
  'CONDITION',
  // R3.5 durable scheduler: a relative per-entity wait. On a long delay the
  // linear runner parks the remaining steps into a durable WorkflowRun that a
  // cron resume sweep picks up (see specs/031 durable-scheduler.md).
  'DELAY',
] as const;

/**
 * DELAY step modes (R3.5). v1 ships `duration` only (covers dunning / loyalty /
 * review sequences); `until` (event-relative ISO / `{{ref}}`) is modeled but the
 * live runner defers it to a follow-up per Decision A.
 */
export const FLOW_DELAY_MODES = ['duration', 'until'] as const;
export type FlowDelayMode = (typeof FLOW_DELAY_MODES)[number];

/** DELAY duration bounds (ms): 1 minute … 90 days (the dunning/loyalty horizon). */
export const FLOW_DELAY_LIMITS = {
  durationMsMin: 60_000,
  durationMsMax: 90 * 24 * 3600_000,
  untilMax: 200,
} as const;
/** CONDITION step operator (doc 18.3). */
export const CONDITION_OPERATORS = [
  'equal_to',
  'not_equal_to',
  'greater_than',
  'less_than',
  'greater_than_or_equal',
  'less_than_or_equal',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_set',
  'is_not_set',
] as const;

// ─── Rule-builder primitive (targeting.rule-engine, R2.1) ────────────────────

/** Objects a condition row can address. Constrained allowlist — each maps to a
 *  storefront resolver (server-side Liquid or client-side JS). No free-form objects. */
export const RULE_OBJECTS = [
  'product',    // current PDP / line context   (server)
  'customer',   // logged-in customer           (server)
  'cart',       // current cart                 (server)
  'geo',        // storefront country/market    (server)
  'temporal',   // date / day-of-week / time    (server or client)
  'behavioral', // session / recently-viewed / scroll / exit / UTM (client only)
] as const;
export type RuleObject = (typeof RULE_OBJECTS)[number];

/** Attributes per object. The pair (object, attribute) is validated against this
 *  map at schema time AND is the resolver dispatch key at runtime. Adding a row
 *  the resolver can't answer is a schema error, not a silent no-op. */
export const RULE_ATTRIBUTES = {
  product: ['tags', 'type', 'vendor', 'handle', 'price', 'collectionIds', 'available'],
  customer: ['loggedIn', 'tags', 'ordersCount', 'totalSpent', 'countryCode', 'acceptsMarketing'],
  cart: ['subtotal', 'itemCount', 'lineCount', 'containsProductId', 'containsCollectionId', 'discountCode'],
  geo: ['countryCode'],
  temporal: ['date', 'dayOfWeek', 'timeOfDay'],
  behavioral: ['recentlyViewedProductId', 'pagesViewedThisSession', 'sessionCount', 'utmSource', 'utmCampaign', 'referrerContains', 'scrollPercent', 'exitIntent'],
} as const satisfies Record<RuleObject, readonly string[]>;

/** Value data-type per `${object}.${attribute}` — drives the value field's parse +
 *  the admin widget. Used to reject "price contains foo" style category errors. */
export const RULE_ATTRIBUTE_VALUE_TYPES: Record<string, 'string' | 'number' | 'boolean' | 'stringList'> = {
  'product.tags': 'stringList', 'product.type': 'string', 'product.vendor': 'string',
  'product.handle': 'string', 'product.price': 'number', 'product.collectionIds': 'stringList',
  'product.available': 'boolean',
  'customer.loggedIn': 'boolean', 'customer.tags': 'stringList', 'customer.ordersCount': 'number',
  'customer.totalSpent': 'number', 'customer.countryCode': 'string', 'customer.acceptsMarketing': 'boolean',
  'cart.subtotal': 'number', 'cart.itemCount': 'number', 'cart.lineCount': 'number',
  'cart.containsProductId': 'string', 'cart.containsCollectionId': 'string', 'cart.discountCode': 'string',
  'geo.countryCode': 'string',
  'temporal.date': 'string' /* ISO */, 'temporal.dayOfWeek': 'number' /* 0-6 */, 'temporal.timeOfDay': 'string' /* HH:MM */,
  'behavioral.recentlyViewedProductId': 'string', 'behavioral.pagesViewedThisSession': 'number',
  'behavioral.sessionCount': 'number', 'behavioral.utmSource': 'string', 'behavioral.utmCampaign': 'string',
  'behavioral.referrerContains': 'string', 'behavioral.scrollPercent': 'number', 'behavioral.exitIntent': 'boolean',
};

/** What a MATCH means when the top-to-bottom evaluation settles. */
export const RULE_MATCH_ACTIONS = ['SHOW', 'HIDE'] as const;
export type RuleMatchAction = (typeof RULE_MATCH_ACTIONS)[number];

/** Limits — keep bounded for prompt/JSON-Schema/token budget and runtime cost. */
export const RULE_LIMITS = {
  maxGroups: 8,        // top-level groups combined by outer logic
  maxRowsPerGroup: 12, // condition rows per group
  maxValueLen: 200,
  maxValueListLen: 30,
} as const;

/** Reuse CONDITION_OPERATORS (above) for rule rows — no parallel operator vocabulary. */

// ─── Shopify GID string patterns (shared, C3) ────────────────────────────────

/**
 * Canonical Shopify GID regexes. Hoisted here (per plan C3 / X-5) so every pack
 * that validates a Product / Collection / ProductVariant GID uses the *identical*
 * pattern — pricing (R2.2, first consumer) and recommendation (R2.3) must not
 * hand-roll drifting variants, or blueprints that share IDs break. Anchored,
 * numeric-id only; no query string / legacy REST paths.
 */
export const PRODUCT_GID_RE = /^gid:\/\/shopify\/Product\/\d+$/;
export const COLLECTION_GID_RE = /^gid:\/\/shopify\/Collection\/\d+$/;
export const PRODUCT_VARIANT_GID_RE = /^gid:\/\/shopify\/ProductVariant\/\d+$/;

// ─── Pricing / discount packs (pricing pack, R2.2) ───────────────────────────

/**
 * Discount kinds — the union the corpus demands (fast-bundle.md:44). One tier set
 * may MIX these across rows (percentage in tier 1, cheapest-free in tier 3, …).
 * Additive: `percentage` / `fixed-amount` map to the legacy `apply` keys the
 * shipped wasm handler already reads; the rest are new keys (handler fast-follow).
 */
export const DISCOUNT_KINDS = [
  'percentage',    // value = 0..100
  'fixed-amount',  // value = money off
  'fixed-price',   // value = final price the set is sold for (Kaching "specific price")
  'cheapest-free', // value ignored; cheapest N in set become free (mix&match tiers)
  'free-shipping', // value ignored
  'free-gift',     // pairs with `gift`; value ignored
  'none',          // no price change (presentation-only tier)
] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/** Threshold basis for tiers / gift. Separate axis from R2.1 cart attributes (C4). */
export const THRESHOLD_BASIS = ['quantity', 'cart-value'] as const;
export type ThresholdBasis = (typeof THRESHOLD_BASIS)[number];

/**
 * How the price change is materialized (pack #24). Gates which shipped Function
 * the compiler lowers into. `discount-code` / `draft-order` stay declarative
 * (AUDIT only — no fake runtime), matching the repo's no-false-published discipline.
 */
export const PRICING_MECHANISMS = [
  'shopify-function-discount',        // → functions.discountRules (default, real)
  'shopify-function-cart-transform',  // → functions.cartTransform (bundle line merge + price)
  'discount-code',                    // declarative today
  'draft-order',                      // declarative today
] as const;
export type PricingMechanism = (typeof PRICING_MECHANISMS)[number];

/** Which primitive drives a pricing block. Exactly one body is authoritative. */
export const PRICING_MODELS = ['single', 'tiered', 'bogo', 'gift'] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

/** Pricing limits — bounded for prompt/JSON-Schema/token budget + runtime cost. */
export const PRICING_LIMITS = {
  tiersMax: 10,
  bogoProductsMax: 100,
  bogoCollectionsMax: 50,
  prerequisiteProductsMax: 100,
  prerequisiteCollectionsMax: 50,
  customerTagsMax: 50,
  giftProductsMax: 20,
  cheapestFreeMax: 20,
} as const;

// ─── Recommendation source (recommendation pack, R2.3) ───────────────────────

/**
 * `recommendation.source` strategy — how offered/recommended products are chosen
 * (R2.3 / pack #25). Ordered by RESOLVER CLASS: the first six are STATIC (resolve
 * in Liquid / Storefront API with NO backend service — native
 * `recommendations`/`collections`/cart + `/recommendations/products.json`); the
 * last four are DYNAMIC (need ranking over order/analytics data or per-session
 * client state, so they route through the App-Proxy recommendation service and
 * degrade to `fallback` until/where that service resolves them).
 *
 * Deliberately trimmed from the research list: `ai-recommended`/`endpoint`/
 * third-party engines are out of scope for R2.3 (no service, no engine-credential
 * vocabulary). Add later only when a resolver exists — a new enum value + a
 * service adapter, no shape change.
 */
export const RECOMMENDATION_STRATEGIES = [
  // ── STATIC (resolve in Liquid / Storefront API, no service) ──
  'manual', // merchant-picked variants
  'collection', // products from a chosen collection (optional random)
  'related', // Shopify product_recommendations intent=related
  'complementary', // Shopify product_recommendations intent=complementary
  'most-expensive-in-cart',
  'cheapest-in-cart',
  // ── DYNAMIC (need the recommendation service / precomputed data) ──
  'top-sellers', // ranked by units sold (window)
  'trending', // ranked by recent velocity
  'buy-it-again', // customer order history
  'recently-viewed', // client-side view log
] as const;
export type RecommendationStrategy = (typeof RECOMMENDATION_STRATEGIES)[number];

/**
 * Which strategies are resolvable with NO backend recommendation service. This
 * is the split invariant: the DYNAMIC four are exactly
 * `RECOMMENDATION_STRATEGIES \ STATIC_RECOMMENDATION_STRATEGIES`, and the service
 * (`recommendation.service.ts`) MUST return `[]` for every static strategy — the
 * "renders without a service" fence.
 */
export const STATIC_RECOMMENDATION_STRATEGIES = [
  'manual',
  'collection',
  'related',
  'complementary',
  'most-expensive-in-cart',
  'cheapest-in-cart',
] as const;
export type StaticRecommendationStrategy = (typeof STATIC_RECOMMENDATION_STRATEGIES)[number];

/** Deterministic fallback when a dynamic strategy yields nothing at render. */
export const RECOMMENDATION_FALLBACKS = ['manual', 'collection', 'related', 'hide'] as const;
export type RecommendationFallback = (typeof RECOMMENDATION_FALLBACKS)[number];

/** Recommendation limits — bounded for prompt/JSON-Schema/token budget + runtime cost. */
export const RECOMMENDATION_LIMITS = {
  manualVariantsMax: 20,
  productLimitMin: 1,
  productLimitMax: 12,
  excludeTagsMax: 20,
  excludeTagLen: 60,
} as const;

// ─── Agentic-commerce surface (M13 / specs/031 agentic-surface.md) ───────────
/**
 * `agentic.catalogProfile` — which AI-channel artifacts a module produces.
 *
 * Only the first three are REAL today: publishing writes the module config, and
 * the app-served feed endpoint (`/agentic/{shop}/{handle}/feed.json`) emits the
 * structured product data to AI channels — the SAME app-served pattern the shipped
 * `pos.extension` uses (publish persists config → an app route reads the active
 * PUBLISHED version → an external consumer fetches). The last three model the
 * Spring-26 agentic stack (UCP + Catalog/Cart/Checkout MCPs, agent-profile
 * registration in the Dev Dashboard, sponsored products) but their runtime is NOT
 * shipped — a module requesting them publishes only the real artifacts, and the
 * compiler names the deferred ones (never faked, never silently "published").
 */
export const AGENTIC_ARTIFACTS = [
  'catalog-feed', // REAL: app-served product feed (JSON) for AI crawlers/agents
  'attribute-map', // REAL: enriches feed rows with normalized attributes (gtin/brand/size/…)
  'compliance-disclosure', // REAL: appends required disclosures to feed rows
  'mcp-endpoint', // needs_runtime: a hosted Catalog-MCP endpoint (follow-up)
  'agent-profile', // needs_runtime: Dev-Dashboard agent registration (follow-up)
  'sponsored-products', // needs_runtime: Catalog-API sponsored placement (follow-up)
] as const;
export type AgenticArtifact = (typeof AGENTIC_ARTIFACTS)[number];

/**
 * Which agentic artifacts have a shipped runtime today. Single source of truth for
 * the compiler split (real ops vs `agentic.deferred-artifacts` note). When a hosted
 * MCP endpoint / agent-profile / sponsored-products runtime lands, add it here — no
 * schema change, the compiler simply stops naming it as deferred.
 */
export const AGENTIC_ARTIFACTS_SHIPPED = [
  'catalog-feed',
  'attribute-map',
  'compliance-disclosure',
] as const;
export type ShippedAgenticArtifact = (typeof AGENTIC_ARTIFACTS_SHIPPED)[number];

/** Which product set the feed syndicates. Static, resolver-backed — no free-form query. */
export const AGENTIC_PRODUCT_SOURCES = ['all', 'collection', 'manual'] as const;
export type AgenticProductSource = (typeof AGENTIC_PRODUCT_SOURCES)[number];

/** Normalized attribute keys an AI channel expects (feeds `attribute-map`). */
export const AGENTIC_ATTRIBUTE_KEYS = [
  'gtin',
  'mpn',
  'brand',
  'size',
  'color',
  'material',
  'gender',
  'ageGroup',
  'condition',
] as const;
export type AgenticAttributeKey = (typeof AGENTIC_ATTRIBUTE_KEYS)[number];

/** Bounds for the agentic catalog-profile (schema-enforced). */
export const AGENTIC_LIMITS = {
  manualProductsMax: 250, // mirrors Catalog-API product-lookup ceiling posture
  collectionsMax: 25,
  attributeMapRowsMax: 50,
  disclosuresMax: 20,
  disclosureLabelMax: 80,
  disclosureTextMax: 500,
  attributeFromMax: 120,
} as const;

/** customerAccount.blocks block kind (doc 18.4). */
export const CUSTOMER_ACCOUNT_BLOCK_KINDS = ['TEXT', 'LINK', 'BADGE', 'DIVIDER'] as const;
/** customerAccount.blocks block tone (doc 18.4). */
export const CUSTOMER_ACCOUNT_BLOCK_TONES = ['info', 'success', 'warning', 'critical'] as const;

/** platform.extensionBlueprint surface (doc 18.5). */
export const BLUEPRINT_SURFACES = ['CHECKOUT_UI', 'THEME_APP_EXTENSION', 'FUNCTION'] as const;

/** Proxy widget mode. */
export const PROXY_WIDGET_MODES = ['JSON', 'HTML'] as const;

/** Cart transform mode. */
export const CART_TRANSFORM_MODES = ['BUNDLE', 'UNBUNDLE'] as const;



/** POS block kind. */
export const POS_BLOCK_KINDS = ['tile', 'modal', 'block', 'action'] as const;

/** HTTP methods for flow / integration. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export const HTTP_METHODS_EXTENDED = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;

/** SEND_HTTP_REQUEST auth type. */
export const HTTP_AUTH_TYPES = ['none', 'basic', 'bearer', 'custom_header'] as const;

// ─── Section 6 Business outcome categories (Goal / Category) ─────────────────
export const RECIPE_GOAL_CATEGORIES = [
  'Upsell & cross-sell',
  'Trust & conversion',
  'Shipping & delivery',
  'Payments & COD control',
  'Checkout rules (validation)',
  'Discounts & pricing',
  'Cart bundling / transforms',
  'Post-purchase engagement',
  'Support & returns',
  'Tracking & analytics',
  'Automation (Flow)',
  'Admin tools',
  'POS tools',
  'Payments provider',
] as const;

// ─── Module categories (doc 3.2) ─────────────────────────────────────────────
export const MODULE_CATEGORIES = [
  'STOREFRONT_UI',
  'ADMIN_UI',
  'FUNCTION',
  'INTEGRATION',
  'FLOW',
  'CUSTOMER_ACCOUNT',
] as const;

export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

// ─── RecipeSpec type discriminators (doc 3.3 + 4.8) — single source for schema and UI ───
export const RECIPE_SPEC_TYPES = [
  // Generic, unrestricted storefront section / theme app extension. `config.kind`
  // is a free-form recommendation tag — merchants can build ANY section, not a
  // fixed list. The named theme.* types below are retained transitionally and are
  // being migrated to theme.section presets (see docs/module-system-v2.md).
  'theme.section',
  'proxy.widget',
  'functions.discountRules',
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.cartAndCheckoutValidation',
  'functions.cartTransform',
  'functions.fulfillmentConstraints',
  'functions.orderRoutingLocationRule',
  // Shipping-discount Function (unified Discount API, SHIPPING class): waives or
  // discounts delivery via cart.delivery-options.discounts.generate.run. This is the
  // runtime the product-discount Function CANNOT provide (its target has no shipping
  // op), so a `free-shipping` pricing rule is only ever enforced here. Backed by the
  // extensions/superapp-shipping-discount crate. See discount-packs.md §9.2.
  'functions.shippingDiscount',
  'checkout.upsell',
  'checkout.block',
  'postPurchase.offer',
  'admin.block',
  'admin.action',
  // Spring 2026 "Discount UI Extension" — an admin UI that configures a discount
  // (pairs with functions.discountRules). Declarative today; needs_runtime until
  // the discount-details extension is shipped.
  'admin.discountUi',
  'pos.extension',
  'analytics.pixel',
  'integration.httpSync',
  'flow.automation',
  // First-class messaging surface (R3.4 / M5): bounded email/slack fan-out over a
  // resolved audience. SMS/push are modeled but gated needs_runtime per-channel.
  'messaging.campaign',
  // Agentic-commerce surface (M13 / Spring-26): a structured product-data feed the
  // merchant surfaces to AI channels, served by a real app endpoint (mirroring the
  // pos.extension app-served model). The MCP/UCP/agent-profile stack is modeled but
  // gated needs_runtime — never faked. See specs/031 agentic-surface.md.
  'agentic.catalogProfile',
  'platform.extensionBlueprint',
  'customerAccount.blocks',
] as const;

export type ModuleType = (typeof RECIPE_SPEC_TYPES)[number];

/** Preferred display order for module types (by category, then logical order). New types not listed fall at end. */
const MODULE_TYPE_ORDER: ModuleType[] = [
  'theme.section',
  'proxy.widget',
  'checkout.upsell',
  'checkout.block',
  'postPurchase.offer',
  'functions.discountRules',
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.cartAndCheckoutValidation',
  'functions.cartTransform',
  'functions.fulfillmentConstraints',
  'functions.orderRoutingLocationRule',
  'functions.shippingDiscount',
  'admin.block',
  'admin.action',
  'admin.discountUi',
  'pos.extension',
  'platform.extensionBlueprint',
  'analytics.pixel',
  'integration.httpSync',
  'flow.automation',
  'messaging.campaign',
  'agentic.catalogProfile',
  'customerAccount.blocks',
];

/**
 * Full extended list of all module types in display order (by category, then logical order).
 * Use this for UI dropdowns so every possible type is shown. Derived from RECIPE_SPEC_TYPES.
 */
export const MODULE_TYPES_DISPLAY_ORDER: ModuleType[] = (() => {
  const orderSet = new Set(MODULE_TYPE_ORDER);
  const rest = (RECIPE_SPEC_TYPES as readonly string[]).filter((t) => !orderSet.has(t as ModuleType));
  return [...MODULE_TYPE_ORDER.filter((t) => RECIPE_SPEC_TYPES.includes(t)), ...rest] as ModuleType[];
})();

/** Module status (lifecycle). */
export const MODULE_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

/** Deploy target kind (doc: theme app extension vs platform extensions). */
export const DEPLOY_TARGET_KINDS = ['THEME', 'PLATFORM'] as const;
export type DeployTargetKind = (typeof DEPLOY_TARGET_KINDS)[number];

/** Shopify surfaces we can generate into (doc 4.1). */
export const SHOPIFY_SURFACES = [
  'online_store',
  'checkout',
  'customer_accounts',
  'admin',
  'pos',
  'flow',
  'marketing_analytics',
  'payments',
  // Agentic-commerce channel (M13 / Spring-26): AI-agent discovery/purchase surfaces
  // fed by a syndicated product-data feed. Distinct from online_store (storefront).
  'agentic_channel',
] as const;
export type ShopifySurface = (typeof SHOPIFY_SURFACES)[number];

/** Map each RecipeSpec type → category (doc 3.3). */
export const MODULE_TYPE_TO_CATEGORY: Record<ModuleType, ModuleCategory> = {
  'theme.section': 'STOREFRONT_UI',
  'proxy.widget': 'STOREFRONT_UI',
  'functions.discountRules': 'FUNCTION',
  'functions.deliveryCustomization': 'FUNCTION',
  'functions.paymentCustomization': 'FUNCTION',
  'functions.cartAndCheckoutValidation': 'FUNCTION',
  'functions.cartTransform': 'FUNCTION',
  'functions.fulfillmentConstraints': 'FUNCTION',
  'functions.orderRoutingLocationRule': 'FUNCTION',
  'functions.shippingDiscount': 'FUNCTION',
  'checkout.upsell': 'STOREFRONT_UI',
  'checkout.block': 'STOREFRONT_UI',
  'postPurchase.offer': 'STOREFRONT_UI',
  'admin.block': 'ADMIN_UI',
  'admin.action': 'ADMIN_UI',
  'admin.discountUi': 'ADMIN_UI',
  'pos.extension': 'ADMIN_UI',
  'analytics.pixel': 'INTEGRATION',
  'integration.httpSync': 'INTEGRATION',
  'flow.automation': 'FLOW',
  // Messaging is a server-side integration effect (fan-out via app connectors),
  // so it reuses the INTEGRATION category (D1) — additive, no new category enum.
  'messaging.campaign': 'INTEGRATION',
  // The catalog-profile feed is a server-side syndication effect (app-served feed),
  // so it reuses the INTEGRATION category — additive, no new category enum.
  'agentic.catalogProfile': 'INTEGRATION',
  'platform.extensionBlueprint': 'ADMIN_UI',
  'customerAccount.blocks': 'CUSTOMER_ACCOUNT',
};

/** Map each RecipeSpec type → default capability requires[] (doc 3.3 primary capability). */
export const MODULE_TYPE_DEFAULT_REQUIRES: Record<ModuleType, readonly string[]> = {
  'theme.section': ['THEME_ASSETS'],
  'proxy.widget': ['APP_PROXY'],
  'functions.discountRules': ['DISCOUNT_FUNCTION'],
  'functions.deliveryCustomization': ['SHIPPING_FUNCTION'],
  'functions.paymentCustomization': ['PAYMENT_CUSTOMIZATION_FUNCTION'],
  'functions.cartAndCheckoutValidation': ['VALIDATION_FUNCTION'],
  'functions.cartTransform': ['CART_TRANSFORM_FUNCTION_UPDATE'],
  'functions.fulfillmentConstraints': [],
  'functions.orderRoutingLocationRule': [],
  'functions.shippingDiscount': ['SHIPPING_FUNCTION'],
  'checkout.upsell': ['CHECKOUT_UI_INFO_SHIP_PAY'],
  'checkout.block': ['CHECKOUT_UI_INFO_SHIP_PAY'],
  'postPurchase.offer': ['CHECKOUT_UI_INFO_SHIP_PAY'],
  'admin.block': [],
  'admin.action': [],
  'admin.discountUi': [],
  'pos.extension': [],
  'analytics.pixel': [],
  'integration.httpSync': [],
  'flow.automation': [],
  'messaging.campaign': [],
  'agentic.catalogProfile': [],
  'platform.extensionBlueprint': [],
  'customerAccount.blocks': ['CUSTOMER_ACCOUNT_UI'],
};

/** Map each RecipeSpec type → Shopify surface (doc 4.1). */
export const MODULE_TYPE_TO_SURFACE: Record<ModuleType, ShopifySurface> = {
  'theme.section': 'online_store',
  'proxy.widget': 'online_store',
  'functions.discountRules': 'checkout',
  'functions.deliveryCustomization': 'checkout',
  'functions.paymentCustomization': 'checkout',
  'functions.cartAndCheckoutValidation': 'checkout',
  'functions.cartTransform': 'checkout',
  'functions.fulfillmentConstraints': 'checkout',
  'functions.orderRoutingLocationRule': 'checkout',
  'functions.shippingDiscount': 'checkout',
  'checkout.upsell': 'checkout',
  'checkout.block': 'checkout',
  'postPurchase.offer': 'checkout',
  'admin.block': 'admin',
  'admin.action': 'admin',
  'admin.discountUi': 'admin',
  'pos.extension': 'pos',
  'analytics.pixel': 'marketing_analytics',
  'integration.httpSync': 'online_store',
  'flow.automation': 'flow',
  // Closest existing surface for outbound messaging (no new surface enum, D1).
  'messaging.campaign': 'marketing_analytics',
  // Dedicated agentic-commerce channel surface (M13) — the feed targets AI channels,
  // not the online store.
  'agentic.catalogProfile': 'agentic_channel',
  'platform.extensionBlueprint': 'admin',
  'customerAccount.blocks': 'customer_accounts',
};

// ─── Catalog generator: surfaces, intents, components, triggers (doc 9.2) ─────
/** Surfaces for storefront catalog entries (placement context). */
export const CATALOG_SURFACES = [
  'home',
  'collection',
  'product',
  'cart',
  'mini_cart',
  'search',
  'account',
  'blog',
  'page',
  'footer',
  'header',
  'policy',
] as const;
/** Intents for catalog/classification. */
export const CATALOG_INTENTS = [
  'promo',
  'capture',
  'upsell',
  'cross_sell',
  'trust',
  'urgency',
  'info',
  'support',
  'compliance',
  'localization',
] as const;
/** Component/template kinds for storefront. */
export const CATALOG_COMPONENTS = [
  'banner',
  'announcement_bar',
  'notification_bar',
  'contact_form',
  'popup',
  'modal',
  'drawer',
  'toast',
  'badge',
  'progress_bar',
  'tabs',
  'accordion',
  'sticky_cta',
  'coupon_reveal',
] as const;
/** Triggers for popup/modal/drawer/toast. */
export const CATALOG_TRIGGERS = [
  'page_load',
  'time_3s',
  'time_10s',
  'scroll_25',
  'scroll_75',
  'exit_intent',
  'add_to_cart',
  'cart_value_x',
  'product_view_2',
  'returning_visitor',
] as const;

// ─── Classification: type → keywords (for classify.server) ────────────────────
export interface ClassificationRule {
  keywords: string[];
  type: string;
  intent?: string;
  surface?: string;
}
export const CLASSIFICATION_RULES: ClassificationRule[] = [
  // Generic section catch-all for custom/novel storefront sections the named presets
  // don't cover. kind is a recommendation; theme.section can express anything.
  {
    keywords: [
      'section', 'custom section', 'faq', 'accordion', 'lookbook', 'size chart', 'size guide',
      'comparison table', 'feature grid', 'tabs', 'testimonial', 'gallery', 'image with text',
      'rich text', 'custom block', 'unique section', 'bespoke section', 'any section',
    ],
    type: 'theme.section',
  },
  { keywords: ['popup', 'pop-up', 'pop up', 'modal', 'overlay', 'lightbox'], type: 'theme.section' },
  {
    keywords: ['contact form', 'contact us', 'support form', 'inquiry form', 'lead form'],
    type: 'theme.section', // collapsed: kind 'contactForm'
  },
  { keywords: ['banner', 'hero', 'hero banner', 'announcement banner'], type: 'theme.section' },
  {
    keywords: ['notification bar', 'announcement bar', 'top bar', 'info bar', 'notice bar'],
    type: 'theme.section', // collapsed: kind 'notification-bar'
  },
  {
    keywords: ['snowfall', 'snow', 'confetti', 'winter effect', 'christmas effect', 'decoration', 'seasonal effect', 'full screen effect', 'holiday effect'],
    type: 'theme.section', // collapsed: kind 'effect'
  },
  {
    keywords: ['floating button', 'floating widget', 'whatsapp button', 'chat button', 'scroll to top', 'sticky button', 'chat widget', 'whatsapp chat', 'floating chat'],
    type: 'theme.section', // collapsed: kind 'floatingWidget'
  },
  { keywords: ['widget', 'store locator', 'proxy', 'app proxy'], type: 'proxy.widget' },
  {
    keywords: ['discount', 'coupon', 'percentage off', 'percent off', 'discount rule', 'price rule'],
    type: 'functions.discountRules',
  },
  {
    // Free / discounted shipping is a DISCOUNT of the delivery cost — the shipping-discount
    // Function (cart.delivery-options.discounts.generate.run), NOT delivery-customization
    // (which only renames/reorders/hides options and cannot change cost). Placed before the
    // delivery rule so "free shipping" routes here first.
    keywords: ['free shipping', 'free delivery', 'waive shipping', 'discounted shipping', 'shipping discount', 'discount shipping', 'shipping over', 'free shipping over', 'ship free'],
    type: 'functions.shippingDiscount',
  },
  {
    keywords: ['delivery', 'shipping', 'shipping method', 'hide shipping', 'delivery customization'],
    type: 'functions.deliveryCustomization',
  },
  {
    keywords: ['payment', 'payment method', 'hide payment', 'payment customization'],
    type: 'functions.paymentCustomization',
  },
  {
    keywords: ['validation', 'validate cart', 'checkout validation', 'block checkout', 'cart validation'],
    type: 'functions.cartAndCheckoutValidation',
  },
  { keywords: ['bundle', 'cart transform', 'product bundle', 'unbundle'], type: 'functions.cartTransform' },
  { keywords: ['upsell', 'checkout upsell', 'cross-sell at checkout', 'order bump'], type: 'checkout.upsell' },
  { keywords: ['checkout block', 'checkout block render'], type: 'checkout.block' },
  { keywords: ['post purchase', 'post-purchase', 'one-click upsell'], type: 'postPurchase.offer' },
  { keywords: ['admin block', 'admin card', 'admin panel', 'admin extension'], type: 'admin.block' },
  { keywords: ['admin action', 'more actions', 'action modal', 'action button'], type: 'admin.action' },
  { keywords: ['pos', 'point of sale', 'pos extension', 'receipt'], type: 'pos.extension' },
  { keywords: ['pixel', 'analytics', 'tracking', 'web pixel', 'event tracking'], type: 'analytics.pixel' },
  { keywords: ['integration', 'http sync', 'api sync', 'webhook sync', 'connector'], type: 'integration.httpSync' },
  {
    keywords: [
      'ai channel', 'agentic', 'agentic commerce', 'ai shopping', 'chatgpt shopping', 'ai agent',
      'product feed', 'catalog feed', 'catalog syndication', 'ai crawler', 'ai discovery',
      'discoverable in chatgpt', 'shop with ai', 'ai catalog',
    ],
    type: 'agentic.catalogProfile',
  },
  { keywords: ['flow', 'automation', 'workflow', 'automate', 'trigger when'], type: 'flow.automation' },
  { keywords: ['extension', 'blueprint', 'scaffolding', 'extension blueprint'], type: 'platform.extensionBlueprint' },
  {
    keywords: ['customer account', 'account page', 'order status', 'order index', 'profile block', 'my account'],
    type: 'customerAccount.blocks',
  },
];

export const INTENT_KEYWORDS: Record<string, string[]> = {
  promo: ['sale', 'promo', 'promotion', 'discount', 'offer', 'deal', 'coupon', 'off'],
  capture: ['email', 'subscribe', 'newsletter', 'sign up', 'signup', 'capture', 'lead'],
  upsell: ['upsell', 'upgrade', 'add-on', 'addon', 'recommended'],
  cross_sell: ['cross-sell', 'cross sell', 'also bought', 'similar', 'related'],
  trust: ['trust', 'review', 'testimonial', 'guarantee', 'badge'],
  urgency: ['urgent', 'countdown', 'limited', 'hurry', 'timer', 'expires', 'last chance'],
  info: ['info', 'information', 'notice', 'announcement', 'update'],
  support: ['support', 'help', 'contact', 'faq', 'chat'],
};

export const SURFACE_KEYWORDS: Record<string, string[]> = {
  home: ['homepage', 'home page', 'landing'],
  product: ['product page', 'product detail', 'pdp'],
  collection: ['collection', 'category', 'catalog'],
  cart: ['cart', 'basket', 'checkout'],
  search: ['search', 'search results'],
  account: ['account', 'my account', 'customer account'],
};

// ─── 4.2.8 All limits (single reference; doc 4.2.8) ───────────────────────────
export const LIMITS = {
  // RecipeSpec base
  nameMin: 3,
  nameMax: 80,
  // heading limits (shared by section, contactForm, etc.)
  headingMin: 1,
  headingMax: 80,
  subheadingMax: 200,
  // theme.section overlay/popup kind (activation: 'overlay')
  popupTitleMin: 1,
  popupTitleMax: 60,
  popupBodyMax: 240,
  popupDelaySecondsMax: 300,
  popupMaxShowsPerDayMax: 100,
  popupCustomPageUrlsMax: 20,
  popupCustomPageUrlMax: 200,
  popupCountdownSecondsMax: 86400,
  popupCountdownLabelMax: 40,
  // StorefrontStyleSchema
  customCssMax: 2000,
  // Functions rules/bundles
  rulesMin: 1,
  rulesMax: 50,
  bundlesMin: 1,
  bundlesMax: 50,
  // flow.automation
  flowStepsMin: 1,
  flowStepsMax: 40,
  // integration.httpSync
  integrationEndpointPathMin: 1,
  integrationEndpointPathMax: 200,
  // customerAccount.blocks
  customerAccountBlocksMin: 1,
  customerAccountBlocksMax: 20,
  // postPurchase.offer / checkout
  offerTitleMin: 1,
  offerTitleMax: 80,
  offerMessageMax: 240,
  // admin.block / pos.extension label
  labelMin: 1,
  labelMax: 80,
  // platform.extensionBlueprint
  goalMin: 5,
  goalMax: 240,
  suggestedFilesMin: 1,
  suggestedFilesMax: 50,
  // Checkout UI
  checkoutUiBundleMaxBytes: 64 * 1024,
  checkoutBlockMessageMax: 240,
  // Function API hard limits (doc 4.8.2)
  functionActivePerStoreMax: 25,
  functionCartTransformPerStore: 1,
} as const;

// ─── Storefront style enums (doc 3.4; single source for StorefrontStyleSchema) ─
export const STOREFRONT_LAYOUT_MODES = ['inline', 'overlay', 'sticky', 'floating'] as const;
export const STOREFRONT_ANCHORS = ['top', 'bottom', 'left', 'right', 'center'] as const;
export const STOREFRONT_WIDTHS = ['auto', 'container', 'narrow', 'wide', 'full'] as const;
export const STOREFRONT_Z_INDEX_LEVELS = ['base', 'dropdown', 'sticky', 'overlay', 'modal'] as const;
export const STOREFRONT_SPACING_OPTIONS = ['none', 'tight', 'medium', 'loose'] as const;
export const STOREFRONT_TYPOGRAPHY_SIZES = ['XS', 'SM', 'MD', 'LG', 'XL', '2XL'] as const;
export const STOREFRONT_TYPOGRAPHY_WEIGHTS = ['normal', 'medium', 'bold'] as const;
export const STOREFRONT_LINE_HEIGHTS = ['tight', 'normal', 'relaxed'] as const;
export const STOREFRONT_ALIGN_OPTIONS = ['left', 'center', 'right'] as const;
export const STOREFRONT_SHAPE_RADIUS = ['none', 'sm', 'md', 'lg', 'xl', 'full'] as const;
export const STOREFRONT_BORDER_WIDTHS = ['none', 'thin', 'medium', 'thick'] as const;
export const STOREFRONT_SHADOW_LEVELS = ['none', 'sm', 'md', 'lg'] as const;
// Phase #2 (029) token substrate — the four coherent elevation idioms (design-vocabulary §1.5),
// a density dial, and motion tokens (§1.6). All additive/optional; compiled to --sa-* vars.
export const STOREFRONT_ELEVATION_IDIOMS = ['soft', 'glow', 'border', 'emboss'] as const;
export const STOREFRONT_DENSITY_LEVELS = ['compact', 'comfortable', 'airy'] as const;
export const STOREFRONT_MOTION_DURATIONS = ['none', 'fast', 'base', 'slow'] as const;
export const STOREFRONT_MOTION_EASINGS = ['standard', 'enter', 'exit', 'mechanical'] as const;
// Global radius scaling knob (Radix `scaling`): shift a whole module tight↔soft in one move.
export const STOREFRONT_RADIUS_SCALING_MIN = 50;
export const STOREFRONT_RADIUS_SCALING_MAX = 150;
export const STOREFRONT_OFFSET_MIN = -100;
export const STOREFRONT_OFFSET_MAX = 100;

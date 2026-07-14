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
/**
 * Placeable templates for Theme App Blocks. The finite base set (excludes
 * gift_card, robots.txt). Classic customer templates (`customer/*`) are ALSO
 * placeable for app blocks and are enumerated here alongside the OS-2.0 core set;
 * dynamic-source `metaobject/<type>` templates are validated by pattern (they are
 * open-ended by definition — one per merchant-defined metaobject type — so they
 * cannot be a closed enum). See `isThemePlaceableTemplate`.
 */
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
  // Classic customer templates (placeable for app blocks; distinct from OS-2.0 core).
  'customer/account',
  'customer/activate_account',
  'customer/addresses',
  'customer/login',
  'customer/order',
  'customer/register',
  'customer/reset_password',
] as const;
/** Pattern for metaobject templates: metaobject/<type> e.g. metaobject/book */
export const THEME_METAOBJECT_TEMPLATE_PREFIX = 'metaobject';
/**
 * A metaobject-scoped template: `metaobject/<type>` where <type> is a merchant-
 * defined metaobject definition handle (`[a-z0-9_-]`, e.g. `metaobject/book`).
 * Open-ended by design — cannot be a closed enum.
 */
const METAOBJECT_TEMPLATE_RE = /^metaobject\/[a-z0-9][a-z0-9_-]{0,48}$/;
/**
 * True for any template accepted by placement: a member of the finite
 * `THEME_PLACEABLE_TEMPLATES` set OR a valid `metaobject/<type>` template.
 */
export function isThemePlaceableTemplate(t: string): boolean {
  return (THEME_PLACEABLE_TEMPLATES as readonly string[]).includes(t) || METAOBJECT_TEMPLATE_RE.test(t);
}

// ─── 4.2.3 Section group types ─────────────────────────────────────────────────
export const THEME_SECTION_GROUPS = ['header', 'footer', 'aside', '*'] as const;
/** custom.<NAME> — NAME is unlimited; use this for validation pattern */
export const THEME_SECTION_GROUP_CUSTOM_PREFIX = 'custom.';
/**
 * A custom section group: `custom.<name>` where <name> matches a theme's
 * `sections/custom.<name>.json` group (`[a-z0-9_-]`, e.g. `custom.overlay`).
 * Open-ended by design (themes define their own groups) — cannot be a closed enum.
 */
const CUSTOM_SECTION_GROUP_RE = /^custom\.[a-z0-9][a-z0-9_-]{0,48}$/;
/**
 * True for any section group accepted by placement: a member of the finite
 * `THEME_SECTION_GROUPS` set OR a valid `custom.<name>` group.
 */
export function isThemeSectionGroup(g: string): boolean {
  return (THEME_SECTION_GROUPS as readonly string[]).includes(g) || CUSTOM_SECTION_GROUP_RE.test(g);
}

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

// ─── 4.3.2 Checkout render vocabulary (build #2, 034) ─────────────────────────
/**
 * Interactive buyer-input field kinds a checkout.block can render. Each maps to a
 * Polaris checkout `s-*` web component (2026-04). Interactive kinds are honored
 * ONLY on the checkout surface (buyer-input APIs don't exist on thank-you targets)
 * — on thank-you the renderer degrades them to a read-only label.
 */
export const CHECKOUT_FIELD_KINDS = [
  'text', // s-text-field
  'textarea', // s-text-area
  'checkbox', // s-checkbox
  'choice-list', // s-choice-list / s-choice
  'select', // s-select / s-option
  'email', // s-email-field
  'number', // s-number-field
] as const;

/**
 * Where a captured field value is written back into the checkout. `attribute`
 * (cart attribute via applyAttributeChange), `note` (buyer note via
 * applyNoteChange), `metafield` (cart metafield via applyMetafieldChange). All
 * are gated at runtime by the matching cart instruction and are checkout-only.
 */
export const CHECKOUT_INPUT_TARGET_KINDS = ['attribute', 'note', 'metafield'] as const;

/**
 * Non-interactive layout/presentation kinds a checkout.block can render. Each maps
 * to checkout-safe Polaris `s-*` components; all render on both surfaces.
 */
export const CHECKOUT_LAYOUT_KINDS = [
  'banner', // s-banner
  'progress-bar', // s-progress (e.g. free-shipping goal)
  'trust-badges', // s-badge cluster
  'payment-icons', // s-payment-icon strip
  'countdown', // urgency countdown (rendered as text; no timers in SSR)
  'testimonial', // quote + attribution
  'divider', // s-divider
] as const;

/** Checkout `s-badge`/`s-banner` tones (1:1 with Polaris checkout tones). */
export const CHECKOUT_TONES = ['auto', 'info', 'success', 'warning', 'critical'] as const;

/**
 * Protected-customer-data access level a checkout.block declares it needs. Level 1
 * = customer id / image / ordersCount; Level 2 = name / email / phone / address.
 * This is a DECLARATION only — actual access is granted app-wide in shopify.app.toml
 * + a Partner-dashboard data-protection request. Surfaced as a merchant-facing note.
 */
export const CHECKOUT_PROTECTED_DATA_LEVELS = ['none', 'level1', 'level2'] as const;

/** Checkout `s-payment-icon` types the payment-icons layout kind accepts. */
export const CHECKOUT_PAYMENT_ICON_TYPES = [
  'visa',
  'mastercard',
  'amex',
  'discover',
  'diners',
  'jcb',
  'paypal',
  'apple-pay',
  'google-pay',
  'shop-pay',
] as const;

/**
 * Whether a checkout target is a buyer-input WRITE surface. Thank-you and
 * order-status targets are read-only (no applyAttributeChange / applyNoteChange /
 * applyMetafieldChange), so interactive fields there degrade to read-only labels.
 */
export function isCheckoutWriteSurface(target: string): boolean {
  return target.startsWith('purchase.checkout.');
}

/** Whether a checkout target requires Shopify Plus to take effect at runtime. */
export function isCheckoutPlusOnlyTarget(target: string): boolean {
  return CHECKOUT_UI_PLUS_ONLY_TARGET_PREFIXES.some((p) => target.startsWith(p));
}

/**
 * Merchant-facing NOTES (never blocks) for a checkout.block config: a
 * protected-customer-data declaration and any interactive buyer-input writes. These
 * surface real requirements honestly — protected data needs an app-level access
 * request + Partner-dashboard approval to actually populate, and buyer-input writes
 * only apply when the buyer isn't using an accelerated checkout (Apple/Google Pay)
 * and the matching cart instruction is enabled. Returns [] when nothing applies.
 */
export function checkoutBlockPublishNotes(config: {
  protectedData?: string;
  fields?: Array<{ write?: { to?: string } | undefined }> | undefined;
}): string[] {
  const notes: string[] = [];
  const level = config.protectedData;
  if (level === 'level1') {
    notes.push(
      'This block declares Level 1 protected-customer-data (customer id / order count). ' +
        'The data populates only once the app is granted Level 1 access (shopify.app.toml ' +
        '[access.protected_customer_data] + Partner-dashboard approval); until then those values are empty.',
    );
  } else if (level === 'level2') {
    notes.push(
      'This block declares Level 2 protected-customer-data (name / email / phone / address). ' +
        'The data populates only once the app is granted Level 2 access (shopify.app.toml ' +
        '[access.protected_customer_data] with the required fields + Partner-dashboard approval); ' +
        'until then those values are empty.',
    );
  }
  const writes = (config.fields ?? []).filter((f) => f?.write?.to);
  if (writes.length > 0) {
    notes.push(
      'Buyer-input fields write to the cart (attributes / note / metafield). Writes are skipped ' +
        'when the buyer uses an accelerated checkout (Apple Pay / Google Pay) or the matching cart ' +
        'instruction is disabled — the fields still render, they just do not persist in those cases.',
    );
  }
  return notes;
}

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

// ─── 18.4 customerAccount.blocks config.target ────────────────────────────────
/**
 * Every customer-account UI extension render target the shipped generic extension
 * (extensions/customer-account-ui) registers and can mount a config-driven block at
 * (build #3, 034). 1:1 with CUSTOMER_ACCOUNT_TARGETS — the config target enum and
 * the toml-registered target set are one source of truth, mirroring the checkout
 * build's full-surface coverage. The `order.action` pair (menu-item + action) is
 * modelled by ACTION_KINDS below rather than a distinct config target.
 */
export const CUSTOMER_ACCOUNT_BLOCK_TARGETS = [
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
/**
 * `admin_print` (Print Action Extension API) targets — the four surfaces where a
 * custom print document (label / packing slip / invoice / pick list) can be produced
 * for orders and products (verified 2026-04 via dev MCP: Print Action Extension API
 * "Support Targets (4)"). Backs the `admin.print` RecipeSpec type; the shipped
 * admin-print extension registers one entrypoint per target, each rendering an
 * `s-admin-print-action` whose `src` points at the app's `/admin-print/document`
 * route parameterized by the published config.
 */
export const ADMIN_PRINT_TARGETS = [
  'admin.order-details.print-action.render',
  'admin.product-details.print-action.render',
  'admin.order-index.selection-print-action.render',
  'admin.product-index.selection-print-action.render',
] as const;
export type AdminPrintTarget = (typeof ADMIN_PRINT_TARGETS)[number];

/**
 * `admin_link` extension targets — deep links from a Shopify admin resource page to
 * a page of the app. Distinct Shopify extension TYPE (`admin_link`), NOT a ui_extension:
 * the registration IS the deploy (a `[[extensions.targeting]] target + url` in the
 * extension toml; Shopify appends the store + resource-id URL params at click time).
 * This is the AUTHORITATIVE 2026-04 enum, verified via `shopify app config validate`.
 * `admin.<resource>-details.action.link` places the link in the resource-page action
 * menu; `admin.<resource>-index.(selection-)action.link` places it in the index page /
 * bulk-selection action bar; `admin.app.intent.link` / `admin.app.support.link` are the
 * special resource-independent targets invokable anywhere.
 */
export const ADMIN_LINK_TARGETS = [
  'admin.abandoned-checkout-details.action.link',
  'admin.abandoned-checkout-index.action.link',
  'admin.discount-index.action.link',
  'admin.discount-index.selection-action.link',
  'admin.discount-details.action.link',
  'admin.customer-index.action.link',
  'admin.customer-index.selection-action.link',
  'admin.customer-details.action.link',
  'admin.order-index.action.link',
  'admin.order-index.selection-action.link',
  'admin.order-details.action.link',
  'admin.draft-order-details.action.link',
  'admin.draft-order-index.action.link',
  'admin.draft-order-index.selection-action.link',
  'admin.product-index.action.link',
  'admin.product-index.selection-action.link',
  'admin.product-details.action.link',
  'admin.product-variant-details.action.link',
  'admin.product-variant-index.selection-action.link',
  'admin.collection-details.action.link',
  'admin.collection-index.action.link',
  'admin.order-fulfilled-card.action.link',
  'admin.app.support.link',
  'admin.page-index.action.link',
  'admin.page-details.action.link',
  'admin.blog-details.action.link',
  'admin.article-details.action.link',
  'admin.app.intent.link',
] as const;
export type AdminLinkTarget = (typeof ADMIN_LINK_TARGETS)[number];

/**
 * `admin.print` document kinds — a recommendation tag for the generated print doc,
 * mapped to the app's print-document renderer. Free-form-ish but bounded so previews
 * and the shipped renderer can branch on the intent.
 */
export const ADMIN_PRINT_DOCUMENT_KINDS = ['packing-slip', 'invoice', 'shipping-label', 'pick-list', 'custom'] as const;
export type AdminPrintDocumentKind = (typeof ADMIN_PRINT_DOCUMENT_KINDS)[number];

/**
 * `admin.customers.segmentation-templates.data` — the single runnable target for a
 * customer-segment template extension (verified 2026-04 via dev MCP). The extension
 * returns an array of `{ title, description, query }` templates the merchant inserts
 * in the segment editor with one click. Backed by the `admin.segmentTemplate` type.
 */
export const ADMIN_SEGMENT_TEMPLATE_TARGET = 'admin.customers.segmentation-templates.data' as const;

export const ADMIN_TARGETS = [
  ...ADMIN_ACTION_TARGETS,
  ...ADMIN_BLOCK_TARGETS,
  ...ADMIN_PRINT_TARGETS,
  ...ADMIN_LINK_TARGETS,
  ADMIN_SEGMENT_TEMPLATE_TARGET,
  'admin.customers.segmentation-templates.render',
  'admin.product-details.configuration.render',
  'admin.product-variant-details.configuration.render',
  'admin.settings.validation.render',
] as const;

// ─── 4.7 POS UI targets ──────────────────────────────────────────────────────
/**
 * The 30 `*.render` POS UI extension targets (2026-04, verified via dev-MCP). Every
 * target here is a *rendering* surface — a tile, modal, block, menu-item, or action
 * overlay the shipped generic POS block (`extensions/superapp-pos-block`) mounts and
 * drives from PUBLISHED config read via `/api/pos/config`. The four background
 * `*.event.observe` targets are enumerated separately in POS_EVENT_TARGETS and folded
 * into POS_TARGETS below.
 */
export const POS_RENDER_TARGETS = [
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

/**
 * The four background `pos.*.event.observe` targets (2026-04, verified via dev-MCP).
 * Unlike the render targets, an observer has NO UI: it runs a side-effect-only handler
 * when the named POS event fires (cart mutated, sale/transaction completed, a cash-drawer
 * counting session opened or closed). The shipped block mounts an observer entry that
 * reads the module's declared `observe` config and forwards the event to the app
 * (`/api/pos/observe`) — e.g. loyalty accrual on transaction-complete, till-audit logging
 * on cash-tracking sessions. Observers never render and never block the POS flow.
 */
export const POS_EVENT_TARGETS = [
  'pos.cart-update.event.observe',
  'pos.transaction-complete.event.observe',
  'pos.cash-tracking-session-start.event.observe',
  'pos.cash-tracking-session-complete.event.observe',
] as const;

/** All 34 POS UI extension targets (30 render + 4 event.observe), 2026-04. */
export const POS_TARGETS = [
  ...POS_RENDER_TARGETS,
  ...POS_EVENT_TARGETS,
] as const;

export type PosRenderTarget = (typeof POS_RENDER_TARGETS)[number];
export type PosEventTarget = (typeof POS_EVENT_TARGETS)[number];
export type PosTarget = (typeof POS_TARGETS)[number];

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
 * Delivery channels. All four now have a SHIPPED CONNECTOR:
 *  - `email` / `slack` — EmailConnector / SlackConnector (reachable via the live
 *    FlowRunnerService step kinds SEND_EMAIL_NOTIFICATION / SEND_SLACK_MESSAGE).
 *  - `sms`  — SmsConnector (Twilio-style provider interface), consent-gated.
 *  - `push` — WebPushConnector (VAPID + service-worker), subscription-gated.
 *
 * IMPORTANT — connector ≠ configured. `sms` / `push` can only ACTUALLY send when
 * the merchant has supplied their provider credentials (SMS provider SID/token/from;
 * VAPID key pair + subject). Absent those, the channel is reported `needs_runtime`
 * at compile preflight and refused loudly at runtime — never a fake send. Consent is
 * always enforced. See `messagingChannelSendability`.
 */
export const MESSAGING_CHANNELS = ['email', 'sms', 'push', 'slack'] as const;
export type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

/**
 * Channels whose CONNECTOR CODE is shipped. Single source of truth for the compiler
 * preflight gate + the MessagingRunnerService channel gate. `email` / `slack` send
 * with app-level credentials; `sms` / `push` additionally require the MERCHANT's
 * provider credentials before they leave `needs_runtime` (the credential axis is
 * `messagingChannelSendability`, NOT this set — a shipped connector still needs
 * config). Membership here means "the runner has a real code path", not "will send
 * unconditionally".
 */
export const MESSAGING_CHANNELS_SHIPPED = ['email', 'slack', 'sms', 'push'] as const;
export type ShippedMessagingChannel = (typeof MESSAGING_CHANNELS_SHIPPED)[number];

/**
 * Which env vars must be present for a channel's PROVIDER credentials to be
 * configured. `email`/`slack` need none here (they use app-level credentials wired
 * elsewhere — EMAIL_API_KEY / SLACK_WEBHOOK_URL — and are always considered ready so
 * their behaviour is unchanged). `sms`/`push` need the MERCHANT/app to supply the
 * listed keys; absent any, the channel stays `needs_runtime` / unconfigured.
 *
 * Env-var-based so the gate is inspectable and deterministic without a DB read; a
 * future per-tenant credential store can layer on top by passing an explicit
 * `creds` map to `messagingChannelSendability`.
 */
export const MESSAGING_CHANNEL_CREDENTIAL_ENV: Record<MessagingChannel, readonly string[]> = {
  email: [],
  slack: [],
  sms: ['SMS_PROVIDER_ACCOUNT_SID', 'SMS_PROVIDER_AUTH_TOKEN', 'SMS_PROVIDER_FROM'],
  push: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
};

/** Outcome of the per-channel sendability check (connector shipped + configured?). */
export type MessagingChannelSendability =
  | { channel: MessagingChannel; status: 'ready' }
  | { channel: MessagingChannel; status: 'needs_connector'; missing: readonly string[] }
  | { channel: MessagingChannel; status: 'needs_credentials'; missing: readonly string[] };

/**
 * The HONEST per-channel gate: can this channel actually deliver a message right now?
 *
 *  - `needs_connector`  — no shipped connector code (never happens for the four we
 *    model, kept for forward-compat if a channel is added to MESSAGING_CHANNELS but
 *    not to _SHIPPED).
 *  - `needs_credentials` — connector shipped, but the required provider credentials
 *    are absent → the channel cannot send. Publish is blocked (needs_runtime) and the
 *    runner refuses loudly. NEVER a fake send.
 *  - `ready`            — connector shipped AND (for sms/push) credentials present.
 *
 * `creds` lets a caller supply an explicit credential map (per-tenant store); when
 * omitted the app-level env is consulted via the passed `env` (defaults to the
 * ambient process env in the connector/runner). Pure + injectable for tests.
 */
export function messagingChannelSendability(
  channel: MessagingChannel,
  env: Record<string, string | undefined> = {},
): MessagingChannelSendability {
  if (!(MESSAGING_CHANNELS_SHIPPED as readonly string[]).includes(channel)) {
    return { channel, status: 'needs_connector', missing: [] };
  }
  const required = MESSAGING_CHANNEL_CREDENTIAL_ENV[channel] ?? [];
  const missing = required.filter((k) => {
    const v = env[k];
    return typeof v !== 'string' || v.trim() === '';
  });
  if (missing.length > 0) {
    return { channel, status: 'needs_credentials', missing };
  }
  return { channel, status: 'ready' };
}

/**
 * What causes the campaign to fan out.
 *  - `broadcast`     one-shot blast to the resolved audience (admin "Send now" / SCHEDULED cron).
 *  - `event`         reacts to a live FlowRunnerService trigger (order/create, product/update, …).
 *  - `back_in_stock` event convenience preset: resolves to SHOPIFY_WEBHOOK_PRODUCT_UPDATED → notify a waitlist store.
 *  - `drip`          a multi-STEP sequence: the first step fires on `dripPreset`'s
 *                    entry event, and each subsequent step is parked on the R3.5
 *                    durable scheduler (DELAY-park) and delivered after its delay.
 *                    Reuses the SAME park→resume spine as cross-run paging.
 */
export const MESSAGING_TRIGGER_KINDS = ['broadcast', 'event', 'back_in_stock', 'drip'] as const;
export type MessagingTriggerKind = (typeof MESSAGING_TRIGGER_KINDS)[number];

/**
 * Drip ENTRY presets — each resolves to a live trigger + a first-send condition,
 * exactly like `back_in_stock` does for the single-shot case. A drip campaign picks
 * one preset for its entry point; the steps after it are timed relative to entry via
 * the durable scheduler.
 *
 *  - `browse_abandon`      customer viewed but didn't buy → nudge (entry: order/create
 *                          is NOT the signal; browse-abandon enters on a captured
 *                          data_store record — SUPERAPP_DATA_RECORD_CREATED — written
 *                          by a storefront view-capture; no fabricated browse event).
 *  - `price_drop`          a product's price fell → notify a waitlist (entry:
 *                          SHOPIFY_WEBHOOK_PRODUCT_UPDATED, guarded by a price-drop).
 *  - `replenishment`       consumable re-order reminder N days post-purchase (entry:
 *                          SHOPIFY_WEBHOOK_ORDER_CREATED; first step delayed).
 *  - `win_back`            lapsed-customer re-engagement timer (entry:
 *                          SHOPIFY_WEBHOOK_ORDER_CREATED; long delay to first step).
 *  - `post_purchase`       post-purchase thank-you / cross-sell sequence (entry:
 *                          SHOPIFY_WEBHOOK_ORDER_CREATED; short delay to first step).
 *  - `back_in_stock`       restock waitlist as a multi-step drip (entry:
 *                          SHOPIFY_WEBHOOK_PRODUCT_UPDATED, inventory-cross guard).
 */
export const MESSAGING_DRIP_PRESETS = [
  'browse_abandon',
  'price_drop',
  'replenishment',
  'win_back',
  'post_purchase',
  'back_in_stock',
] as const;
export type MessagingDripPreset = (typeof MESSAGING_DRIP_PRESETS)[number];

/**
 * The live entry trigger each drip preset resolves to. Mirrors how `back_in_stock`
 * resolves to SHOPIFY_WEBHOOK_PRODUCT_UPDATED — no fabricated events; every entry is
 * a real webhook or a real captured data-record.
 */
export const MESSAGING_DRIP_PRESET_ENTRY: Record<MessagingDripPreset, string> = {
  browse_abandon: 'SUPERAPP_DATA_RECORD_CREATED',
  price_drop: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
  replenishment: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
  win_back: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
  post_purchase: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
  back_in_stock: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
};

/** Drip step bounds (schema-enforced). One entry step + up to N delayed follow-ups. */
export const MESSAGING_DRIP_LIMITS = {
  stepsMax: 6, // entry + up to 5 follow-ups
  stepDelayMsMin: 60_000, // 1 minute (test/urgent floor)
  stepDelayMsMax: 90 * 24 * 3600_000, // 90 days (matches FLOW_DELAY_LIMITS horizon)
} as const;

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
export const CUSTOMER_GID_RE = /^gid:\/\/shopify\/Customer\/\d+$/;
export const LOCATION_GID_RE = /^gid:\/\/shopify\/Location\/\d+$/;

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

/**
 * The subset of {@link PRICING_MECHANISMS} that is DECLARATIVE-ONLY: no shipped
 * runtime materializes them. `compiler/pricing/lower.ts` lowers only the two
 * `shopify-function-*` mechanisms into live Function config; `discount-code` /
 * `draft-order` change nothing at checkout today.
 *
 * Single source of truth for the honesty rules layered on top (plan 1c): the
 * per-type enum catalog (`control-packs/type-enums.ts`) omits these from what
 * generation may emit for a Function type, and publish classifies a spec pinned
 * to one of them as `needs_runtime` (never a fake-published discount). The shared
 * `RecipeSpecSchema` still ACCEPTS them so already-persisted specs keep validating.
 */
export const DECLARATIVE_PRICING_MECHANISMS = ['discount-code', 'draft-order'] as const;
export type DeclarativePricingMechanism = (typeof DECLARATIVE_PRICING_MECHANISMS)[number];

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
 * ALL SIX are REAL as of build #7c: publishing writes the module config, and app
 * routes read the active PUBLISHED version to serve each surface — the SAME app-served
 * pattern the shipped `pos.extension` uses (publish persists config → an app route reads
 * the active PUBLISHED version → an external consumer fetches). The Spring-26 agentic
 * stack (UCP discovery + Storefront-Catalog MCP, agent/business profile, sponsored
 * products) is served from THIS app's backend — no external registration, so all are
 * genuinely `deployable`:
 *   - catalog-feed / attribute-map / compliance-disclosure → `/agentic/{shop}/{handle}/feed.json`
 *   - mcp-endpoint       → `/agentic/{shop}/{handle}/mcp` (JSON-RPC) + `.well-known/ucp` discovery
 *   - agent-profile      → `/agentic/{shop}/{handle}/agent-profile.json`
 *   - sponsored-products → config only (promoted GIDs boosted in the MCP/feed ranking)
 * The one thing that still needs a merchant/theme grant — Shopify's storefront-populated
 * theme `agents.md` — is emitted honestly via the flag-gated Theme Edit path (inert until
 * `write_themes` + a page-builder exemption), with an app-served copy that works today.
 */
export const AGENTIC_ARTIFACTS = [
  'catalog-feed', // REAL: app-served product feed (JSON) for AI crawlers/agents
  'attribute-map', // REAL: enriches feed rows with normalized attributes (gtin/brand/size/…)
  'compliance-disclosure', // REAL: appends required disclosures to feed rows
  'mcp-endpoint', // REAL: app-served Storefront-Catalog MCP (JSON-RPC) + /.well-known/ucp discovery
  'agent-profile', // REAL: app-served UCP business/agent-profile document describing the store
  'sponsored-products', // REAL: merchant-promoted products boosted in agentic (MCP/feed) results
] as const;
export type AgenticArtifact = (typeof AGENTIC_ARTIFACTS)[number];

/**
 * Which agentic artifacts have a shipped runtime today. Single source of truth for
 * the compiler split (real ops vs `agentic.deferred-artifacts` note).
 *
 * Build #7c promoted `mcp-endpoint` / `agent-profile` / `sponsored-products` to shipped:
 * they are ALL app-served (no external registration), exactly like the catalog-feed —
 *   - mcp-endpoint       → `/agentic/{shop}/{handle}/mcp` (JSON-RPC 2.0: search_catalog /
 *                          get_product / lookup_catalog) + `/agentic/{shop}/{handle}/.well-known/ucp`
 *   - agent-profile      → `/agentic/{shop}/{handle}/agent-profile.json`
 *   - sponsored-products → config only (promoted GIDs boosted in MCP/feed ranking)
 * The one artifact that would need EXTERNAL registration — listing the store in a
 * public agent directory / the Shopify-populated theme `agents.md` — is intentionally
 * NOT modeled here as a fake-shipped artifact. `agents.md` itself is emitted honestly
 * via the flag-gated Theme Edit path (see AGENTIC_AGENTS_MD_* below), which is inert
 * until `write_themes` + a page-builder exemption are granted, plus an app-served copy
 * that works today.
 */
export const AGENTIC_ARTIFACTS_SHIPPED = [
  'catalog-feed',
  'attribute-map',
  'compliance-disclosure',
  'mcp-endpoint',
  'agent-profile',
  'sponsored-products',
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
  sponsoredProductsMax: 25, // merchant-promoted GIDs boosted in agentic results
  agentInstructionsMax: 2000, // free-text agent-profile instructions (agent-profile / agents.md)
} as const;

/**
 * UCP (Universal Commerce Protocol) surface constants for the app-served agentic
 * endpoints. The version string matches Shopify's 2026-04 UCP edition; the service
 * name mirrors the `dev.ucp.shopping` namespace agents negotiate against.
 *
 * These describe the DISCOVERY + MCP surface the app serves per published feed:
 *   - `/agentic/{shop}/{handle}/.well-known/ucp`  → UCP discovery (version + services)
 *   - `/agentic/{shop}/{handle}/mcp`              → JSON-RPC 2.0 Storefront-Catalog MCP
 *   - `/agentic/{shop}/{handle}/agent-profile.json` → the store's agent/business profile
 */
export const UCP_VERSION = '2026-04-08' as const;
export const UCP_SERVICE_NAME = 'dev.ucp.shopping' as const;
/** UCP capabilities the app-served catalog MCP implements today (read-only catalog). */
export const UCP_CATALOG_CAPABILITY = 'dev.ucp.shopping.catalog' as const;

/**
 * The tools the app-served Storefront-Catalog MCP exposes. Names conform to the UCP
 * Catalog capability / MCP binding (search_catalog / get_product / lookup_catalog) so
 * a compliant agent can call them without custom glue. All READ-ONLY, product-data
 * only (the same public projection the feed emits — no PII, no cart/checkout writes).
 */
export const AGENTIC_MCP_TOOLS = ['search_catalog', 'get_product', 'lookup_catalog'] as const;
export type AgenticMcpTool = (typeof AGENTIC_MCP_TOOLS)[number];

/**
 * customerAccount.blocks block kind (doc 18.4). The first four (TEXT|LINK|BADGE|
 * DIVIDER) are the legacy static set and render byte-identically. Build #3 (034)
 * adds the interactive + data-bound set the shipped generic customer-account UI
 * extension maps onto Polaris `s-*` web components (2026-04):
 *   BUTTON  → s-button (navigate via `url`, or open a block's MODAL via `modalId`)
 *   FORM    → s-text-field/s-text-area/s-select/etc. wrapped in an s-form; captured
 *             values POST to the app proxy declared by the block's `submit` config
 *   MODAL   → s-modal opened by a BUTTON with a matching `modalId`
 *   ACTION  → the `customer-account.order.action.*` pair: a menu-item that presents
 *             an order-scoped action overlay (see CUSTOMER_ACCOUNT_ACTION_KINDS)
 * All new kinds degrade gracefully (render nothing / a plain label) when their
 * required data or API surface is unavailable — never a hard error.
 */
export const CUSTOMER_ACCOUNT_BLOCK_KINDS = [
  'TEXT',
  'LINK',
  'BADGE',
  'DIVIDER',
  'BUTTON',
  'FORM',
  'MODAL',
  'ACTION',
] as const;
/** customerAccount.blocks block tone (doc 18.4). */
export const CUSTOMER_ACCOUNT_BLOCK_TONES = ['info', 'success', 'warning', 'critical'] as const;

/**
 * A FORM block's input-field kind → Polaris customer-account `s-*` component
 * (2026-04). Mirrors the checkout field vocab so the two builds stay aligned.
 */
export const CUSTOMER_ACCOUNT_FIELD_KINDS = [
  'text', // s-text-field
  'textarea', // s-text-area
  'select', // s-select / s-option
  'email', // s-email-field
  'number', // s-number-field
  'checkbox', // s-checkbox
] as const;

/**
 * A live value a block can BIND to. The config only DECLARES which value it wants;
 * the shipped generic extension resolves it at render time via the Customer Account
 * API / Order API (`order.*`, `customer.*`, `subscription.*`) or our app-owned
 * source (`loyalty.points`, `customer.storeCreditBalance` when app-owned). Any
 * binding that can't be resolved on the current surface degrades to the block's
 * literal `content` (or renders nothing) — never an error.
 */
export const CUSTOMER_ACCOUNT_BINDINGS = [
  'order.trackingNumber',
  'order.trackingUrl',
  'order.fulfillmentStatus',
  'order.financialStatus',
  'order.returnStatus',
  'order.statusPageUrl',
  'customer.storeCreditBalance',
  'customer.displayName',
  'customer.ordersCount',
  'subscription.nextOrderDate',
  'subscription.status',
  'loyalty.points',
] as const;

/**
 * The overlay an `order.action` block presents when its menu-item is selected.
 * `modal` shows an in-page s-modal; `link` navigates to a URL (e.g. a returns
 * portal or app-proxy page). Models the order.action + menu-item pairing without a
 * distinct config target — the block is authored once and mounted at both the
 * `order.action.menu-item.render` (the trigger) and `order.action.render` (the
 * overlay) targets by the shipped extension.
 */
export const CUSTOMER_ACCOUNT_ACTION_KINDS = ['modal', 'link'] as const;

/**
 * Whether a customer-account target can WRITE (submit a FORM / mutate). All
 * customer-account render targets are read-first; FORM submission goes through the
 * app proxy, not a checkout-style buyer-input API. This helper marks the surfaces
 * that carry an order/customer context a binding can resolve against.
 */
export function customerAccountSurfaceScope(
  target: string,
): 'order' | 'profile' | 'index' | 'page' {
  if (target.startsWith('customer-account.order-status.') || target.startsWith('customer-account.order.')) {
    return 'order';
  }
  if (target.startsWith('customer-account.profile.')) return 'profile';
  if (target.startsWith('customer-account.order-index.')) return 'index';
  return 'page';
}

/** platform.extensionBlueprint surface (doc 18.5). */
export const BLUEPRINT_SURFACES = ['CHECKOUT_UI', 'THEME_APP_EXTENSION', 'FUNCTION'] as const;

/** Proxy widget mode. */
export const PROXY_WIDGET_MODES = ['JSON', 'HTML'] as const;

/**
 * Cart transform mode.
 * - `BUNDLE` / `MERGE` — combine ≥2 component lines into one bundle parent
 *   (`linesMerge`). `MERGE` is the first-class name for this operation; `BUNDLE`
 *   is retained as its back-compat alias (both compile identically).
 * - `UNBUNDLE` — expand one line into its components (`lineExpand`); reserved.
 */
export const CART_TRANSFORM_MODES = ['BUNDLE', 'MERGE', 'UNBUNDLE'] as const;



/**
 * POS block kind — how the module presents on its target surface.
 * - `tile`   → a smart-grid tile on `pos.home.tile.render` (its companion `pos.home.modal.render`
 *              opens via `shopify.action.presentModal()`).
 * - `modal`  → a full-screen modal/action overlay (`*.action.render`, `pos.home.modal.render`).
 * - `block`  → a persistent info section inside a details screen (`*.block.render`).
 * - `action` → a menu-item button (`*.action.menu-item.render`) that presents the companion modal.
 * - `receipt`→ a print-only header/footer block (`pos.receipt-header/-footer.block.render`).
 * - `observer` → a background `*.event.observe` handler with no UI.
 * `receipt` and `observer` are additive; the original four are retained for back-compat.
 */
export const POS_BLOCK_KINDS = ['tile', 'modal', 'block', 'action', 'receipt', 'observer'] as const;

/**
 * The behaviour a POS block/action performs when the staff member taps it. The config only
 * DECLARES the action; the shipped generic POS entry (`extensions/superapp-pos-block/src/
 * posBehavior.js`) resolves it at run time against the REAL 2026-04 POS UI Extensions API —
 * every method is FLAT on `shopify` (verified via dev-MCP). Each action is gated on the
 * real method actually being present; when absent it reports `unsupported` with a toast —
 * it NEVER toasts success for a skipped call. Every entry here maps to a real method or a
 * clearly-marked app-proxy path — nothing that can only no-op.
 *
 * - `NONE`             → display only (a block that just shows data / a label).
 * - `PRESENT_MODAL`    → open the companion modal (`shopify.action.presentModal()`); the
 *                        tile↔modal / menu-item↔action pairing (see POS_PRESENTATIONS).
 * - `APPLY_CART_DISCOUNT`  → `shopify.applyCartDiscount('Percentage'|'FixedAmount', title, amount)`.
 * - `APPLY_CODE_DISCOUNT`  → `shopify.addCartCodeDiscount(code)` (discount code; no amount).
 * - `APPLY_LINE_DISCOUNT`  → `shopify.bulkSetLineItemDiscounts([...])` on the selected line
 *                            (`shopify.cartLineItem.uuid`); cart line-item targets only.
 * - `SET_CART_NOTE`        → `shopify.bulkCartUpdate({ note })`.
 * - `ADD_CART_PROPERTY`    → `shopify.addLineItemProperties(uuid, props)` when a line-item
 *                            context exists, else `shopify.addCartProperties(props)`.
 * - `ADD_LINE_ITEM`        → `shopify.addLineItem(variantId:number, qty)` (NUMERIC variant id,
 *                            extracted from the configured GID).
 * - `LOYALTY_READ`         → read a loyalty/points balance from the app proxy (app-proxy path).
 * - `LOYALTY_WRITE`        → write a loyalty-ledger entry (accrue/redeem) via the app proxy.
 * - `RECEIPT_CONTENT`      → contribute static/bound content to a receipt header/footer block
 *                            (declarative; rendered by Receipt.jsx, not an imperative call).
 * - `PRINT`                → `shopify.print(src)` (FLAT Print API) — send a document to a printer.
 * - `APP_PROXY_POST`       → POST the surface context to a declared app-proxy endpoint (generic write).
 *
 * REMOVED (2026-04 audit): `OPEN_URL` — POS UI has NO external-URL-open capability; the
 * Navigation API (`navigation.navigate`) is in-modal screen routing only, so an OPEN_URL
 * action could only ever no-op. Dropped from the enum so no template can request it.
 */
export const POS_ACTIONS = [
  'NONE',
  'PRESENT_MODAL',
  'APPLY_CART_DISCOUNT',
  'APPLY_CODE_DISCOUNT',
  'APPLY_LINE_DISCOUNT',
  'SET_CART_NOTE',
  'ADD_CART_PROPERTY',
  'ADD_LINE_ITEM',
  'LOYALTY_READ',
  'LOYALTY_WRITE',
  'RECEIPT_CONTENT',
  'PRINT',
  'APP_PROXY_POST',
] as const;
export type PosAction = (typeof POS_ACTIONS)[number];

/**
 * A live value a POS block can BIND to render. The config only DECLARES which value it wants;
 * the shipped generic POS entry (`posBehavior.js`) resolves it at render time from the REAL
 * 2026-04 contextual API (verified via dev-MCP). Only fields the API GENUINELY exposes are
 * here — a binding that can't be resolved on the current surface degrades to the block's
 * literal `label`; it is NEVER a fabricated literal masquerading as a live value.
 *
 * KEPT-NATIVE (resolve directly from the real API):
 *  - `cart.*`      → `shopify.cart.current.value` { subtotal, grandTotal, taxTotal, lineItems }.
 *                    `cart.total` reads `grandTotal`; `cart.itemCount` sums `lineItems[].quantity`.
 *  - `lineItem.*`  → `shopify.cartLineItem` { title, quantity } (cart line-item targets only).
 *  - `order.name`  → `shopify.order.name` (Order API exposes id / name / customerId ONLY).
 *  - `session.*`   → `shopify.session.currentSession` — IDs/currency ONLY (locationId,
 *                    staffMemberId, currency). POS exposes NO staff/location NAMES.
 *
 * APP-PROXY-MARKED (app-owned; resolved by the modal via the app proxy, not inline):
 *  - `loyalty.points`, `loyalty.tier` — served by `appProxyPath` (LOYALTY_READ).
 *
 * REMOVED (2026-04 audit — the real API does NOT expose these; keeping them would force a
 * false literal-fallback pretending to be a live value):
 *  - `cart.note`                          (POS cart read has no `note` field)
 *  - `customer.displayName/email/ordersCount/amountSpent`  (Customer API = `{ id }` only)
 *  - `order.financialStatus/fulfillmentStatus/totalPrice`  (Order API = `{ id,name,customerId }` only)
 *  - `product.title/totalInventory`       (Product API = `{ id, variantId }` only)
 *  - `session.staffMemberName/locationName`  (Session has IDs only — no name fields)
 * The dropped customer/order/product fields could be fetched by GID via the app proxy in a
 * follow-up (see #7); until a resolver exists they stay OUT of the enum, not faked.
 */
export const POS_DATA_BINDINGS = [
  'cart.subtotal',
  'cart.total',
  'cart.taxTotal',
  'cart.itemCount',
  'lineItem.title',
  'lineItem.quantity',
  'order.name',
  'session.locationId',
  'session.staffMemberId',
  'session.currency',
  'loyalty.points',
  'loyalty.tier',
] as const;
export type PosDataBinding = (typeof POS_DATA_BINDINGS)[number];

/**
 * The tile↔modal / menu-item↔action presentation pairing a module uses. POS models
 * multi-screen workflows as a lightweight *trigger* surface that presents a *companion*
 * full-screen surface via `shopify.action.presentModal()`:
 * - `STANDALONE`    → renders on a single target with no companion (a block, receipt, tile-only,
 *                     or an observer).
 * - `TILE_MODAL`    → a `pos.home.tile.render` tile whose tap presents `pos.home.modal.render`.
 * - `MENUITEM_ACTION` → a `*.action.menu-item.render` button whose tap presents the paired
 *                     `*.action.render` overlay (product/customer/order/draft-order/register/
 *                     purchase/return/exchange details).
 * The shipped generic extension authors the pair ONCE from config and mounts it at both the
 * trigger and companion targets — no second module row.
 */
export const POS_PRESENTATIONS = ['STANDALONE', 'TILE_MODAL', 'MENUITEM_ACTION'] as const;
export type PosPresentation = (typeof POS_PRESENTATIONS)[number];

/**
 * POS events an `*.event.observe` module can subscribe to. Mirrors POS_EVENT_TARGETS as a
 * config-facing enum (the target string is derived from the event via `posEventToTarget`).
 */
export const POS_OBSERVE_EVENTS = [
  'cart-update',
  'transaction-complete',
  'cash-tracking-session-start',
  'cash-tracking-session-complete',
] as const;
export type PosObserveEvent = (typeof POS_OBSERVE_EVENTS)[number];

/** Map a POS observe-event enum to its `*.event.observe` target string. */
export function posEventToTarget(event: PosObserveEvent): PosEventTarget {
  return `pos.${event}.event.observe` as PosEventTarget;
}

/**
 * The presentation model a POS render target participates in, derived from the target string.
 * `menu-item` targets are triggers that present the paired `action.render` overlay; `home.tile`
 * presents `home.modal`; everything else is standalone. Lets the shipped extension pick the
 * right companion target without a second config field.
 */
export function posTargetPresentation(target: string): PosPresentation {
  if (target === 'pos.home.tile.render') return 'TILE_MODAL';
  if (target.endsWith('.action.menu-item.render')) return 'MENUITEM_ACTION';
  return 'STANDALONE';
}

/** True when a POS target is a background observer (no UI). */
export function isPosEventTarget(target: string): target is PosEventTarget {
  return target.endsWith('.event.observe');
}

/**
 * Which contextual POS API a target carries — the data/action surface a block can bind or act
 * against. Used to decide, at authoring/preflight time, whether a declared action/binding is
 * resolvable on the chosen target (e.g. APPLY_CART_DISCOUNT needs a `cart` surface).
 */
export function posTargetSurface(
  target: string,
): 'home' | 'cart' | 'customer' | 'product' | 'order' | 'draft-order' | 'register' | 'receipt' | 'event' {
  if (target.startsWith('pos.home.')) return 'home';
  if (target.startsWith('pos.cart')) return 'cart';
  if (target.startsWith('pos.customer-details.')) return 'customer';
  if (target.startsWith('pos.product-details.')) return 'product';
  if (target.startsWith('pos.draft-order-details.')) return 'draft-order';
  if (target.startsWith('pos.register-details.')) return 'register';
  if (target.startsWith('pos.receipt-')) return 'receipt';
  if (isPosEventTarget(target)) return 'event';
  // order-details, exchange.post, purchase.post, return.post all carry the Order API.
  return 'order';
}

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
  // Local Pickup delivery-option generator (BOPIS): GENERATES local-pickup options at
  // checkout via purchase.local-pickup-delivery-option-generator.run. Backed by the
  // extensions/superapp-local-pickup crate. The API is currently `unstable`-only
  // (verified 2026-07-04 via dev MCP), so eligibility gates it needs_runtime.
  'functions.localPickupDeliveryOption',
  // Pickup Point delivery-option generator (parcel lockers / post offices): GENERATES
  // third-party pickup-point options at checkout via
  // purchase.pickup-point-delivery-option-generator.run. Backed by the
  // extensions/superapp-pickup-point crate. `unstable`-only, so gated needs_runtime.
  'functions.pickupPointDeliveryOption',
  'checkout.upsell',
  'checkout.block',
  'postPurchase.offer',
  'admin.block',
  'admin.action',
  // Spring 2026 "Discount UI Extension" — an admin UI that configures a discount
  // (pairs with functions.discountRules), rendered by the shipped
  // discount-function-settings extension at admin.discount-details.function-settings.render.
  'admin.discountUi',
  // Admin link extension (`admin_link` type): a deep link from an admin resource page
  // to a page of the app. The toml registration IS the deploy; the shipped admin-link
  // extension family carries the config-driven link targets.
  'admin.link',
  // Admin print extension (`admin_print` / Print Action Extension API): produces a
  // custom print document (packing slip / invoice / label) for orders + products,
  // rendered by the shipped admin-print extension whose s-admin-print-action src
  // points at the app's print-document route.
  'admin.print',
  // Customer-segment template extension (admin.customers.segmentation-templates.data):
  // returns pre-built segment query templates into the segment editor, served by the
  // shipped segment-template extension reading the published config.
  'admin.segmentTemplate',
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
  'functions.localPickupDeliveryOption',
  'functions.pickupPointDeliveryOption',
  'admin.block',
  'admin.action',
  'admin.discountUi',
  'admin.link',
  'admin.print',
  'admin.segmentTemplate',
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
  'functions.localPickupDeliveryOption': 'FUNCTION',
  'functions.pickupPointDeliveryOption': 'FUNCTION',
  'checkout.upsell': 'STOREFRONT_UI',
  'checkout.block': 'STOREFRONT_UI',
  'postPurchase.offer': 'STOREFRONT_UI',
  'admin.block': 'ADMIN_UI',
  'admin.action': 'ADMIN_UI',
  'admin.discountUi': 'ADMIN_UI',
  'admin.link': 'ADMIN_UI',
  'admin.print': 'ADMIN_UI',
  'admin.segmentTemplate': 'ADMIN_UI',
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
  'functions.localPickupDeliveryOption': ['SHIPPING_FUNCTION'],
  'functions.pickupPointDeliveryOption': ['SHIPPING_FUNCTION'],
  'checkout.upsell': ['CHECKOUT_UI_INFO_SHIP_PAY'],
  'checkout.block': ['CHECKOUT_UI_INFO_SHIP_PAY'],
  'postPurchase.offer': ['CHECKOUT_UI_INFO_SHIP_PAY'],
  'admin.block': [],
  'admin.action': [],
  'admin.discountUi': [],
  'admin.link': [],
  'admin.print': [],
  'admin.segmentTemplate': [],
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
  'functions.localPickupDeliveryOption': 'checkout',
  'functions.pickupPointDeliveryOption': 'checkout',
  'checkout.upsell': 'checkout',
  'checkout.block': 'checkout',
  'postPurchase.offer': 'checkout',
  'admin.block': 'admin',
  'admin.action': 'admin',
  'admin.discountUi': 'admin',
  'admin.link': 'admin',
  'admin.print': 'admin',
  'admin.segmentTemplate': 'admin',
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
    // Pickup-point (parcel locker / post office / third-party drop-off) generation.
    // Placed before local-pickup + delivery so "parcel locker" doesn't collapse to
    // in-store pickup or generic delivery.
    keywords: ['pickup point', 'pickup-point', 'parcel locker', 'parcel shop', 'post office pickup', 'locker delivery', 'collection point', 'inpost', 'packstation'],
    type: 'functions.pickupPointDeliveryOption',
  },
  {
    // Local-pickup / BOPIS (buy online, pick up in store) option generation. Placed
    // before the generic delivery rule so "in-store pickup" routes here.
    keywords: ['local pickup', 'in-store pickup', 'in store pickup', 'store pickup', 'pickup in store', 'buy online pick up in store', 'bopis', 'click and collect', 'curbside pickup'],
    type: 'functions.localPickupDeliveryOption',
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
  {
    keywords: ['admin print', 'print action', 'packing slip', 'print invoice', 'shipping label', 'print label', 'pick list', 'print document', 'custom invoice'],
    type: 'admin.print',
  },
  {
    keywords: ['admin link', 'deep link', 'link extension', 'link to app', 'admin deep link', 'resource link', 'jump to app'],
    type: 'admin.link',
  },
  {
    keywords: ['segment template', 'customer segment template', 'segmentation template', 'segment editor', 'pre-built segment', 'segment query template'],
    type: 'admin.segmentTemplate',
  },
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
// Two-pack render grammar (module-design-system.md §3.3.1). `auto` is resolved app-side
// at generation (resolveStorefrontPack, §9.2) to a concrete pack; the storefront reads the
// resolved value from style_json.pack and stamps `.superapp-scope[data-sa-pack]`.
export const STOREFRONT_STYLE_PACKS = ['auto', 'luxe', 'bold'] as const;
// Global radius scaling knob (Radix `scaling`): shift a whole module tight↔soft in one move.
export const STOREFRONT_RADIUS_SCALING_MIN = 50;
export const STOREFRONT_RADIUS_SCALING_MAX = 150;
export const STOREFRONT_OFFSET_MIN = -100;
export const STOREFRONT_OFFSET_MAX = 100;

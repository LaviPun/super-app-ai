/**
 * Extension eligibility registry — the single source of truth for HOW every
 * module type deploys, what Shopify plan/scopes it needs to take effect, and
 * whether its runtime is actually shipped.
 *
 * This replaces the old binary "blocked / gated" model. A merchant can ask for
 * ANYTHING, so the platform must answer one of two honest things for every type:
 *   1. `deployable`     — a real runtime is shipped; publish writes config the
 *                         runtime reads. (Plan/scope requirements are surfaced as
 *                         merchant-facing NOTES, never a silent block — e.g.
 *                         "delivery customization runs on Shopify Plus".)
 *   2. `needs_runtime`  — the runtime binary/extension is not shipped yet. This is
 *                         the ONLY thing that genuinely can't deploy, and the goal
 *                         is to drive this set to empty by shipping each runtime.
 *
 * The registry maps each `ModuleType` to a concrete Shopify extension family
 * (theme app extension, checkout UI, admin UI, customer-account UI, Flow,
 * Web Pixel, POS UI, Function wasm, app proxy, or a composite). `runtimeShipped`
 * is static for fixed-family runtimes (theme/checkout/admin/etc. that live in
 * `extensions/`) and computed from the deployed-function manifest for Functions.
 *
 * Mirrors the public Shopify extension surface so the categorization tracks
 * "the list from Shopify". Extend by adding/flipping an entry when a runtime ships.
 */
import type { ModuleType } from './allowed-values.js';
import { RECIPE_SPEC_TYPES } from './allowed-values.js';
import type { CapabilitySurface } from './capability-graph.js';
import { getCapabilityNode } from './capability-graph.js';

/** The Shopify extension family that backs a module type at runtime. */
export type ExtensionRuntimeKind =
  | 'theme' // theme app extension (extensions/theme-app-extension)
  | 'checkout-ui' // checkout UI extension (extensions/checkout-ui)
  | 'customer-account-ui' // extensions/customer-account-ui
  | 'admin-ui' // extensions/admin-ui
  | 'flow' // Flow actions/triggers (extensions/superapp-flow-*)
  | 'web-pixel' // Web Pixel extension (analytics)
  | 'pos-ui' // POS UI extension
  | 'app-proxy' // handled server-side via the app proxy (always available)
  | 'function' // Shopify Function (wasm)
  | 'agentic-feed' // app-served read-only product feed for AI channels (M13)
  | 'composite'; // composes other module types (no runtime of its own)

/** Merchant Shopify plan tier (from Shop.planTier). */
export type MerchantPlanTier = 'plus' | 'standard' | 'unknown';

export type ExtensionEligibility = {
  moduleType: ModuleType;
  surface: CapabilitySurface;
  runtime: ExtensionRuntimeKind;
  /**
   * For `runtime: 'function'`, the wasm extension handle that must be deployed.
   * Shipped-ness for functions is computed from the deployed-function manifest.
   */
  functionHandle?: string;
  /**
   * Whether the (non-function) runtime extension is shipped in `extensions/`.
   * For `runtime: 'function'`, this is ignored — use the manifest.
   */
  runtimeShipped: boolean;
  /**
   * Shopify plan required for this surface/API to take EFFECT at runtime. The
   * config still deploys on any plan; this is a merchant-facing note, not a block.
   * `undefined` ⇒ available on all plans.
   */
  requiresPlan?: 'plus';
  /** Access scopes the app must hold to write this module's config. */
  requiredScopes: string[];
  /** Short merchant-facing description of how this module deploys. */
  note: string;
};

/**
 * Plan-gated Shopify Function APIs: these only take effect on Shopify Plus. We
 * still build + deploy the wasm and write config; the merchant simply needs Plus
 * for it to run. Surfaced as a note so the answer is "deployable on Plus", never
 * "blocked".
 */
const PLUS_ONLY_FUNCTIONS = new Set<ModuleType>([
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.cartAndCheckoutValidation',
]);

/**
 * Function wasm extension handles, by module type (Layer-A runtimes). These match
 * the `handle` in each `extensions/<dir>/shopify.extension.toml`. A handle here is
 * only "deployable" once it's also in the deployed-extensions manifest.
 *
 * `orderRoutingLocationRule` has NO entry: the Shopify CLI offers no order-routing
 * function template, so there is no wasm to ship — it stays `needs_runtime` until
 * Shopify exposes that surface.
 */
export const FUNCTION_RUNTIME_HANDLES: Record<string, string> = {
  'functions.cartTransform': 'cart-transform-function',
  'functions.discountRules': 'discount-function',
  'functions.shippingDiscount': 'superapp-shipping-discount',
  'functions.deliveryCustomization': 'superapp-delivery-customization',
  'functions.paymentCustomization': 'superapp-payment-customization',
  'functions.cartAndCheckoutValidation': 'superapp-cart-checkout-validation',
  'functions.fulfillmentConstraints': 'superapp-fulfillment-constraints',
};

/**
 * How each module type deploys. `runtimeShipped` reflects what physically exists
 * in `extensions/` today (flip to `true` the moment a runtime ships). For
 * functions, `runtimeShipped` is unused — the deployed-function manifest decides.
 */
const REGISTRY: Record<ModuleType, Omit<ExtensionEligibility, 'surface'>> = {
  // ── Theme app extension (shipped) ──────────────────────────────────────────
  'theme.section': {
    moduleType: 'theme.section',
    runtime: 'theme',
    runtimeShipped: true,
    requiredScopes: ['write_metaobjects', 'read_themes'],
    note: 'Renders as a theme app block via the storefront theme extension.',
  },
  'proxy.widget': {
    moduleType: 'proxy.widget',
    runtime: 'app-proxy',
    runtimeShipped: true,
    requiredScopes: ['write_metaobjects'],
    note: 'Served through the app proxy; available on all plans.',
  },

  // ── Shopify Functions (wasm) ───────────────────────────────────────────────
  'functions.discountRules': fn('functions.discountRules', 'Applies server-side discounts via a Function.'),
  'functions.cartTransform': fn('functions.cartTransform', 'Merges/expands cart lines via a Cart Transform Function.'),
  'functions.deliveryCustomization': fn(
    'functions.deliveryCustomization',
    'Reorders/renames/hides delivery options via a Function (runs on Shopify Plus).',
  ),
  'functions.paymentCustomization': fn(
    'functions.paymentCustomization',
    'Reorders/renames/hides payment methods via a Function (runs on Shopify Plus).',
  ),
  'functions.cartAndCheckoutValidation': fn(
    'functions.cartAndCheckoutValidation',
    'Blocks cart/checkout progress on rule violations via a Function (checkout-level validation runs on Shopify Plus).',
  ),
  'functions.fulfillmentConstraints': fn(
    'functions.fulfillmentConstraints',
    'Constrains how line items can be grouped/fulfilled via a Function.',
  ),
  'functions.orderRoutingLocationRule': fn(
    'functions.orderRoutingLocationRule',
    'Influences which location fulfills an order via a Function.',
  ),
  // Shipping-discount Function (unified Discount API, SHIPPING class). Waives/discounts
  // delivery via cart.delivery-options.discounts.generate.run — the runtime the
  // product-discount Function cannot provide. The crate exists
  // (extensions/superapp-shipping-discount) but, like every Function, resolves
  // shipped-ness from the deployed-function manifest: `isRuntimeShipped` returns false
  // (→ needs_runtime) until `superapp-shipping-discount` appears in the deployed handles.
  // Needs `write_discounts` in addition to `write_metaobjects` because it is an
  // automatic discount (discount-packs.md §9.2).
  'functions.shippingDiscount': {
    ...fn('functions.shippingDiscount', 'Waives or discounts shipping (free/discounted delivery) via a Function.'),
    requiredScopes: ['write_metaobjects', 'write_discounts'],
  },

  // ── Checkout / post-purchase UI (shipped: extensions/checkout-ui) ──────────
  'checkout.upsell': {
    moduleType: 'checkout.upsell',
    runtime: 'checkout-ui',
    runtimeShipped: true,
    requiresPlan: 'plus',
    requiredScopes: ['write_metaobjects'],
    note: 'Renders in checkout via a checkout UI extension (checkout extensibility runs on Shopify Plus).',
  },
  'checkout.block': {
    moduleType: 'checkout.block',
    runtime: 'checkout-ui',
    runtimeShipped: true,
    requiresPlan: 'plus',
    requiredScopes: ['write_metaobjects'],
    note: 'Renders a custom block in checkout via a checkout UI extension (runs on Shopify Plus).',
  },
  'postPurchase.offer': {
    moduleType: 'postPurchase.offer',
    runtime: 'checkout-ui',
    runtimeShipped: true,
    requiredScopes: ['write_metaobjects'],
    note: 'Renders on the Thank-you / Order-status page via the checkout UI extension (available on all plans).',
  },

  // ── Admin UI (shipped: extensions/admin-ui) ────────────────────────────────
  'admin.block': {
    moduleType: 'admin.block',
    runtime: 'admin-ui',
    runtimeShipped: true,
    requiredScopes: ['write_metaobjects'],
    note: 'Renders inside the Shopify admin via an admin UI extension.',
  },
  'admin.action': {
    moduleType: 'admin.action',
    runtime: 'admin-ui',
    runtimeShipped: true,
    requiredScopes: ['write_metaobjects'],
    note: 'Adds an admin action via an admin UI extension.',
  },
  // Spring 2026 Discount UI Extension. The discount-details admin UI extension is
  // not yet built in `extensions/`, so runtimeShipped:false → needs_runtime until
  // it ships (generatable + previewable meanwhile; pairs with functions.discountRules).
  'admin.discountUi': {
    moduleType: 'admin.discountUi',
    runtime: 'admin-ui',
    runtimeShipped: false,
    requiredScopes: ['write_metaobjects', 'write_discounts'],
    note: 'Discount UI Extension (Spring 2026) — configures a discount from the admin. Needs the discount-details extension shipped before it can publish.',
  },

  // ── Customer account UI (shipped: extensions/customer-account-ui) ──────────
  'customerAccount.blocks': {
    moduleType: 'customerAccount.blocks',
    runtime: 'customer-account-ui',
    runtimeShipped: true,
    requiredScopes: ['write_metaobjects'],
    note: 'Renders in customer accounts via a customer-account UI extension.',
  },

  // ── Flow (shipped: extensions/superapp-flow-*) ─────────────────────────────
  'flow.automation': {
    moduleType: 'flow.automation',
    runtime: 'flow',
    // Flow trigger/action extensions ship; flip to true once the compiler
    // persists the workflow definition at publish (see compileFlowAutomation).
    runtimeShipped: false,
    requiredScopes: ['write_metaobjects'],
    note: 'Persists a workflow definition the engine runs; Shopify Flow trigger/action extensions are shipped.',
  },

  // ── Integration (app proxy / server, always available) ─────────────────────
  'integration.httpSync': {
    moduleType: 'integration.httpSync',
    runtime: 'app-proxy',
    // No compiler persists the sync config and nothing consumes it server-side yet,
    // so publishing it would deploy nothing. Gate honestly (needs_runtime) until the
    // sync runtime + compiler are wired (flip to true then) rather than false-publish.
    runtimeShipped: false,
    requiredScopes: ['write_metaobjects'],
    note: 'Runs server-side (scheduled/app-proxy sync). Sync runtime + compiler wiring pending before it can publish.',
  },

  // ── Messaging (app proxy / server, R3.4) ───────────────────────────────────
  'messaging.campaign': {
    moduleType: 'messaging.campaign',
    runtime: 'app-proxy',
    // The EMAIL + SLACK runner is shipped: MessagingRunnerService fans out over the
    // live EmailConnector/SlackConnector at the three trigger sites, and the compiler
    // persists the campaign config (SHOP_METAFIELD_SET, non-AUDIT) → deployable, not
    // false-published. Per-channel shipped-ness (email/slack real; sms/push
    // needs_runtime) is enforced at compile preflight + runtime via
    // MESSAGING_CHANNELS_SHIPPED, not on this per-type registry axis.
    runtimeShipped: true,
    requiredScopes: ['write_metaobjects'],
    note: 'Fans out email/slack to a subscriber list via the app server (EmailConnector/SlackConnector). SMS and push channels are modeled but need their connectors shipped before they can send.',
  },

  // ── Web Pixel (analytics) ──────────────────────────────────────────────────
  'analytics.pixel': {
    moduleType: 'analytics.pixel',
    runtime: 'web-pixel',
    // extensions/superapp-web-pixel ships; compiler emits WEB_PIXEL_UPSERT and
    // PublishService deploys it via webPixelCreate/Update.
    runtimeShipped: true,
    requiredScopes: ['write_pixels', 'read_customer_events'],
    note: 'Subscribes to storefront events via a Web Pixel extension.',
  },

  // ── POS UI ─────────────────────────────────────────────────────────────────
  'pos.extension': {
    moduleType: 'pos.extension',
    runtime: 'pos-ui',
    // Shipped: extensions/superapp-pos-block reads published config from the app
    // backend (/api/pos/config) via App Authentication — POS can't read
    // Storefront metaobjects, so config comes from the app, not metaobjects.
    runtimeShipped: true,
    requiredScopes: ['write_metaobjects'],
    note: 'Renders on Shopify POS via a POS UI extension; reads its published config from the app backend (/api/pos/config) using a session token, since POS cannot read Storefront metaobjects.',
  },

  // ── Agentic-commerce feed (app-served read-only feed, M13) ─────────────────
  'agentic.catalogProfile': {
    moduleType: 'agentic.catalogProfile',
    runtime: 'agentic-feed',
    // Shipped: publishing persists the module config and the app route
    // /agentic/{shop}/{handle}/feed.json serves the structured product-data feed to
    // AI channels (the same app-served model pos.extension uses — publish config →
    // app route reads the active PUBLISHED version → an external consumer fetches).
    // Only the FEED (catalog-feed/attribute-map/compliance-disclosure) is real; the
    // MCP endpoint, agent-profile registration, and sponsored products are modeled
    // but their runtime is NOT shipped — the compiler names them as deferred and
    // preflight surfaces the note, so they are never silently "published".
    runtimeShipped: true,
    requiredScopes: ['read_products'],
    note: 'Publishes an AI-channel product feed served from the app backend (/agentic/{shop}/{handle}/feed.json). The hosted MCP endpoint, agent-profile registration, and sponsored products are modeled but not yet shipped — a published module includes only the feed and names the deferred artifacts.',
  },

  // ── Composite (no runtime of its own; decomposes into real members) ────────
  'platform.extensionBlueprint': {
    moduleType: 'platform.extensionBlueprint',
    runtime: 'composite',
    runtimeShipped: true,
    requiredScopes: [],
    note: 'A blueprint that composes other deployable module types; deploys via its members.',
  },
};

function fn(moduleType: ModuleType, note: string): Omit<ExtensionEligibility, 'surface'> {
  return {
    moduleType,
    runtime: 'function',
    functionHandle: FUNCTION_RUNTIME_HANDLES[moduleType],
    runtimeShipped: false, // functions resolve shipped-ness from the manifest
    requiresPlan: PLUS_ONLY_FUNCTIONS.has(moduleType) ? 'plus' : undefined,
    requiredScopes: ['write_metaobjects'],
    note,
  };
}

/**
 * Native-section deploy MODE eligibility (033). This is NOT a module type — it is
 * the second deploy medium for `theme.section` (`DeployTarget.mode:'native_section'`),
 * so it lives outside `REGISTRY`. The honest state, mirroring how unenforced paths are
 * recorded elsewhere (e.g. free-shipping/order-routing `needs_runtime`):
 *
 *   - The DEFAULT `theme.section` deploy (app-block/metaobject) is fully `deployable`
 *     — that entry in REGISTRY is unchanged.
 *   - The native-section MODE is `needs_runtime` (NOT deployable) until ALL THREE hold:
 *       1. the app holds `write_themes`, AND
 *       2. Shopify has granted the page-builder theme-file-write EXEMPTION, AND
 *       3. the `THEME_NATIVE_SECTION_ENABLED` flag is on.
 *     Until then `themeFilesUpsert` fails at the API; we do not fake deployability.
 *
 * `evaluateNativeSectionEligibility` returns that honest verdict + the audit trail of
 * which of the three gates are unmet, so callers/UI can explain "not yet" without ever
 * reporting a native-section push as published when nothing wrote.
 */
export const THEME_NATIVE_SECTION_ELIGIBILITY = {
  mode: 'native_section' as const,
  moduleType: 'theme.section' as ModuleType,
  runtime: 'theme' as ExtensionRuntimeKind,
  /** Requires the theme-file-write scope IN ADDITION to the app-block path's scopes. */
  requiredScopes: ['write_themes', 'read_themes', 'write_metaobjects'] as string[],
  /**
   * A Shopify-granted exemption (page-builder exception, BFS §3.2.2) is mandatory
   * on top of `write_themes`. Not code — an external approval gate. Inert until granted.
   */
  requiresExemption: true as const,
  note:
    'Pushes a native sections/superapp-*.liquid file via the Theme Files API. Deployable ONLY with ' +
    'write_themes + a Shopify page-builder exemption + THEME_NATIVE_SECTION_ENABLED. Until all three ' +
    'hold it is needs_runtime (the app-block path remains the shipping default).',
} as const;

export type NativeSectionEligibility = {
  status: 'deployable' | 'needs_runtime';
  /** Which of the three gates are currently unmet (audit trail). */
  unmet: Array<'write_themes' | 'exemption' | 'flag'>;
  missingScopes: string[];
  note: string;
};

/**
 * Honest deployability verdict for the native-section MODE. `deployable` only when
 * write_themes is held, the Shopify exemption is granted, AND the flag is on —
 * otherwise `needs_runtime` with the unmet gates named. Never fakes deployability.
 */
export function evaluateNativeSectionEligibility(
  ctx: { grantedScopes?: Iterable<string>; exemptionGranted?: boolean; flagEnabled?: boolean } = {},
): NativeSectionEligibility {
  const granted = new Set(ctx.grantedScopes ?? []);
  const missingScopes = THEME_NATIVE_SECTION_ELIGIBILITY.requiredScopes.filter((s) => !granted.has(s));
  const unmet: NativeSectionEligibility['unmet'] = [];
  if (ctx.grantedScopes && !granted.has('write_themes')) unmet.push('write_themes');
  if (!ctx.exemptionGranted) unmet.push('exemption');
  if (!ctx.flagEnabled) unmet.push('flag');
  return {
    status: unmet.length === 0 ? 'deployable' : 'needs_runtime',
    unmet,
    missingScopes,
    note: THEME_NATIVE_SECTION_ELIGIBILITY.note,
  };
}

/** Eligibility metadata for a module type (surface filled from the capability graph). */
export function getExtensionEligibility(moduleType: ModuleType): ExtensionEligibility {
  const base = REGISTRY[moduleType];
  return { ...base, surface: getCapabilityNode(moduleType).surface };
}

/** All eligibility entries (used by audits/UI). */
export function listExtensionEligibility(): ExtensionEligibility[] {
  return RECIPE_SPEC_TYPES.map(getExtensionEligibility);
}

export type RuntimeShippedCheck = {
  /** Function handles known-deployed via `shopify app deploy` (Layer-A manifest). */
  deployedFunctionHandles?: Iterable<string>;
};

/**
 * Whether a module type's runtime is actually shipped. For functions, this is the
 * presence of its handle in the deployed-function manifest; for fixed-family
 * runtimes it is the static `runtimeShipped` flag.
 */
export function isRuntimeShipped(moduleType: ModuleType, ctx: RuntimeShippedCheck = {}): boolean {
  const e = getExtensionEligibility(moduleType);
  if (e.runtime === 'function') {
    const deployed = new Set(ctx.deployedFunctionHandles ?? []);
    return !!e.functionHandle && deployed.has(e.functionHandle);
  }
  return e.runtimeShipped;
}

/**
 * Whether a module's plan/scope requirements are satisfied for the merchant. This
 * NEVER blocks deploy — it drives a merchant-facing note ("needs Shopify Plus to
 * take effect"). Returns the unmet requirements so the UI can explain them.
 */
export function evaluatePlanEligibility(
  moduleType: ModuleType,
  ctx: { plan?: MerchantPlanTier; grantedScopes?: Iterable<string> } = {},
): { planSatisfied: boolean; requiresPlan?: 'plus'; missingScopes: string[] } {
  const e = getExtensionEligibility(moduleType);
  const plan = ctx.plan ?? 'unknown';
  const planSatisfied = !e.requiresPlan || plan === 'plus';
  const granted = new Set(ctx.grantedScopes ?? []);
  const missingScopes = ctx.grantedScopes ? e.requiredScopes.filter((s) => !granted.has(s)) : [];
  return { planSatisfied, requiresPlan: e.requiresPlan, missingScopes };
}

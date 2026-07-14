/**
 * RecipeSpec schema and deploy types. All type/category/status/deploy enums
 * come from the Allowed Values Manifest (allowed-values.ts) per doc 3.2, 3.3, 4.1.
 */
import { z } from 'zod';
import type { Capability } from './capabilities.js';
import { StorefrontStyleSchema } from './storefront-style.js';
import { AudiencePackSchema } from './control-packs/packs/audience.pack.js';
import { SchedulePackSchema } from './control-packs/packs/schedule.pack.js';
import { AdvancedCustomPackSchema } from './control-packs/packs/advanced-custom.pack.js';
import { LayoutArchetypePackSchema } from './control-packs/packs/layout-archetype.pack.js';
import { RuleEnginePackSchema } from './control-packs/packs/rule-engine.pack.js';
import { PricingPackSchema } from './control-packs/packs/pricing.pack.js';
import { RecommendationPackSchema } from './control-packs/packs/recommendation.pack.js';
import { ProgressGoalPackSchema } from './control-packs/packs/progress-goal.pack.js';
import { MessagingPackSchema } from './control-packs/packs/messaging.pack.js';
import { DataModelSchema, ModuleDataStoreSchema } from './data-model.js';
import type { ModuleCategory, ModuleType } from './allowed-values.js';
import {
  LIMITS,
  isThemePlaceableTemplate,
  isThemeSectionGroup,
  CUSTOMER_ACCOUNT_TARGETS,
  CHECKOUT_UI_TARGETS,
  CHECKOUT_FIELD_KINDS,
  CHECKOUT_INPUT_TARGET_KINDS,
  CHECKOUT_LAYOUT_KINDS,
  CHECKOUT_TONES,
  CHECKOUT_PROTECTED_DATA_LEVELS,
  CHECKOUT_PAYMENT_ICON_TYPES,
  ADMIN_TARGETS,
  ADMIN_BLOCK_TARGETS,
  ADMIN_ACTION_TARGETS,
  ADMIN_LINK_TARGETS,
  ADMIN_PRINT_TARGETS,
  ADMIN_PRINT_DOCUMENT_KINDS,
  POS_TARGETS,
  PIXEL_STANDARD_EVENTS,
  MODULE_CATEGORIES,
  RECIPE_SPEC_TYPES,
  INTEGRATION_HTTP_SYNC_TRIGGERS,
  FLOW_AUTOMATION_TRIGGERS,
  FLOW_STEP_KINDS,
  FLOW_DELAY_MODES,
  FLOW_DELAY_LIMITS,
  CONDITION_OPERATORS,
  CUSTOMER_ACCOUNT_BLOCK_KINDS,
  CUSTOMER_ACCOUNT_BLOCK_TONES,
  CUSTOMER_ACCOUNT_FIELD_KINDS,
  CUSTOMER_ACCOUNT_BINDINGS,
  CUSTOMER_ACCOUNT_ACTION_KINDS,
  BLUEPRINT_SURFACES,
  PROXY_WIDGET_MODES,
  CART_TRANSFORM_MODES,
  POS_BLOCK_KINDS,
  POS_ACTIONS,
  POS_DATA_BINDINGS,
  POS_PRESENTATIONS,
  POS_OBSERVE_EVENTS,
  HTTP_METHODS,
  HTTP_METHODS_EXTENDED,
  HTTP_AUTH_TYPES,
  DEPLOY_TARGET_KINDS,
  AGENTIC_ARTIFACTS,
  AGENTIC_PRODUCT_SOURCES,
  AGENTIC_ATTRIBUTE_KEYS,
  AGENTIC_LIMITS,
  PRODUCT_GID_RE,
  COLLECTION_GID_RE,
  PRODUCT_VARIANT_GID_RE,
  CUSTOMER_GID_RE,
  LOCATION_GID_RE,
} from './allowed-values.js';

// Re-export doc-aligned types and enums from manifest (doc 3.2, 3.3, 4.1).
export type { ModuleCategory, ModuleType, ModuleStatus, DeployTargetKind, ShopifySurface } from './allowed-values.js';
export {
  MODULE_CATEGORIES,
  RECIPE_SPEC_TYPES,
  MODULE_STATUSES,
  DEPLOY_TARGET_KINDS,
  SHOPIFY_SURFACES,
  MODULE_TYPE_TO_CATEGORY,
  MODULE_TYPE_DEFAULT_REQUIRES,
  MODULE_TYPE_TO_SURFACE,
} from './allowed-values.js';

/** All RecipeSpec types as array (for prompt-expectations and UI). */
export const ALL_MODULE_TYPES: ModuleType[] = [...RECIPE_SPEC_TYPES];

/**
 * How a THEME target's `theme.section` compiles (033):
 *  - `app_block` (default / absent) — the shipped path: a `$app:superapp_module`
 *    metaobject rendered by the theme app extension. Fully back-compat; a THEME
 *    target with no `mode` behaves byte-identically to before this field existed.
 *  - `native_section` — compile to a self-contained `sections/superapp-<slug>.liquid`
 *    file with a native `{% schema %}` and push it via the Theme Files API
 *    (`themeFilesUpsert`). Flag-gated (`THEME_NATIVE_SECTION_ENABLED`) and only
 *    deployable once the app holds `write_themes` + a Shopify page-builder exemption.
 */
export type ThemeDeployMode = 'app_block' | 'native_section';

/** Where to deploy: theme app extension via metafields (themeId + moduleId) or platform extensions. Doc-aligned. */
export type DeployTarget =
  | { kind: (typeof DEPLOY_TARGET_KINDS)[0]; themeId: string; moduleId?: string; mode?: ThemeDeployMode }
  | { kind: (typeof DEPLOY_TARGET_KINDS)[1]; moduleId?: string };

export const DeployTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(DEPLOY_TARGET_KINDS[0]),
    themeId: z.string().min(1),
    moduleId: z.string().min(1).optional(),
    // Absent = 'app_block' (the shipped default). Same theme.section spec, two
    // compile targets (033) — NOT a new RecipeSpec type or DEPLOY_TARGET_KINDS value.
    mode: z.enum(['app_block', 'native_section']).optional(),
  }),
  z.object({
    kind: z.literal(DEPLOY_TARGET_KINDS[1]),
    moduleId: z.string().min(1).optional(),
  }),
]);

/**
 * Theme placement: only one of enabled_on or disabled_on (doc 4.2.2B, 4.2.3).
 *
 * `templates` accepts the finite `THEME_PLACEABLE_TEMPLATES` set (now incl. classic
 * `customer/*`) AND open-ended `metaobject/<type>` templates; `groups` accepts the
 * finite `THEME_SECTION_GROUPS` set AND open-ended `custom.<name>` groups. Both are
 * validated by pattern (they cannot be closed enums — one metaobject template per
 * merchant definition, one custom group per theme).
 */
const PlaceableTemplate = z.string().refine(isThemePlaceableTemplate, {
  message: 'Not a placeable template (Allowed Values Manifest 4.2.2B; or metaobject/<type>).',
});
const SectionGroup = z.string().refine(isThemeSectionGroup, {
  message: 'Not a section group (Allowed Values Manifest 4.2.3; or custom.<name>).',
});
const PlacementSchema = z
  .object({
    enabled_on: z
      .object({
        templates: z.array(PlaceableTemplate).optional(),
        groups: z.array(SectionGroup).optional(),
      })
      .optional(),
    disabled_on: z
      .object({
        templates: z.array(PlaceableTemplate).optional(),
        groups: z.array(SectionGroup).optional(),
      })
      .optional(),
  })
  .refine((data) => !(data.enabled_on && data.disabled_on), {
    message: 'Use only one of enabled_on or disabled_on (Allowed Values Manifest).',
  })
  .optional();

/**
 * RecipeSpec is the only thing the AI is allowed to generate.
 * It is validated, versioned, and compiled to safe deploy operations.
 * Limits and enums from Allowed Values Manifest (doc Section 4).
 */
const Base = z.object({
  name: z.string().min(LIMITS.nameMin).max(LIMITS.nameMax),
  category: z.custom<ModuleCategory>(),
  requires: z.array(z.custom<Capability>()).default([]),
  /**
   * Optional module-owned typed data store (Module System v2 backend data).
   * Additive + shared by every variant (all are `Base.extend`), so any surface
   * type can declare a typed store. Provisioned at publish time
   * (`provisionModuleDataStore` → `ensureTypedStore`); absent = no store.
   */
  dataModel: ModuleDataStoreSchema.optional(),
});

/**
 * Tone vocabulary shared by admin badges/text/buttons. Mirrors the Polaris admin
 * `s-badge`/`s-text` tone union (2026-04) so the generic admin UI extension can map
 * a config tone straight to a component tone without translation.
 */
const AdminToneEnum = z.enum(['neutral', 'info', 'success', 'warning', 'critical']);

/**
 * Declarative presentational vocabulary for `admin.block` / `admin.action` modules.
 * The generic shipped admin UI extension (extensions/admin-ui) reads these from the
 * persisted metaobject and renders them with Polaris `s-*` web components — so a
 * published admin module shows real fields, data rows, badges, buttons and links,
 * not just its label. Every key is optional and additive: existing `{target,label}`
 * blocks/actions stay valid and simply render their label + any config keys.
 *
 * Defined as a raw Zod shape (spread into each config `z.object`) rather than a
 * standalone object schema so it composes with the discriminated-union variants.
 */
const AdminContentShape = {
  /** Intro paragraph shown under the heading. */
  description: z.string().max(600).optional(),
  /** Label/value data rows (e.g. "Risk level: High"). Rendered as inline pairs. */
  fields: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        value: z.string().max(400),
        tone: AdminToneEnum.optional(),
      }),
    )
    .max(30)
    .optional(),
  /** Status badges (e.g. "Verified", "VIP"). */
  badges: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        tone: AdminToneEnum.optional(),
      }),
    )
    .max(20)
    .optional(),
  /** A simple data table: header columns + string rows. */
  table: z
    .object({
      columns: z.array(z.string().min(1).max(60)).min(1).max(6),
      rows: z.array(z.array(z.string().max(200)).max(6)).max(50),
    })
    .optional(),
  /** Action buttons. A `url` renders a link-button; otherwise it is inert (display only). */
  buttons: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        url: z.string().max(2000).optional(),
        tone: z.enum(['default', 'critical']).optional(),
      }),
    )
    .max(10)
    .optional(),
  /** Plain hyperlinks (deep-links into the app or external resources). */
  links: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        url: z.string().min(1).max(2000),
      }),
    )
    .max(10)
    .optional(),
} as const;

const CheckoutToneEnum = z.enum(CHECKOUT_TONES);

/**
 * Declarative checkout render vocab (build #2, 034). All optional so the thin
 * `{target,title,message?,productVariantGid?}` checkout.block stays valid and
 * renders byte-identically. The shipped generic checkout UI extension reads these
 * verbatim from the persisted `$app:superapp_checkout_upsell` metaobject and maps
 * them onto checkout-safe Polaris `s-*` components, branching by `target`.
 *
 * Interactive `fields[]` capture buyer input and (checkout surface only) write it
 * back via applyAttributeChange / applyNoteChange / applyMetafieldChange; on
 * thank-you targets they degrade to read-only labels. `layout[]` holds
 * non-interactive presentation (banner / progress-bar / trust-badges /
 * payment-icons / countdown / testimonial / divider). `protectedData` DECLARES the
 * customer-data access level the block relies on (granted app-wide, surfaced as a
 * note — never a silent block).
 */
const CheckoutContentShape = {
  /** Interactive buyer-input fields. Checkout-surface only; read-only on thank-you. */
  fields: z
    .array(
      z.object({
        kind: z.enum(CHECKOUT_FIELD_KINDS).default('text'),
        /** Stable key: the cart attribute / metafield key (or note discriminator). */
        key: z
          .string()
          .min(1)
          .max(60)
          .regex(/^[a-zA-Z0-9_.\-]+$/, 'key must be alphanumeric/underscore/dot/dash'),
        label: z.string().min(1).max(80),
        placeholder: z.string().max(120).optional(),
        required: z.boolean().optional(),
        /** Options for `choice-list` / `select`. */
        options: z
          .array(z.object({ value: z.string().min(1).max(80), label: z.string().min(1).max(80) }))
          .max(20)
          .optional(),
        /** Where the captured value is written. Omit → display/collect only, no write. */
        write: z
          .object({
            to: z.enum(CHECKOUT_INPUT_TARGET_KINDS).default('attribute'),
            /**
             * Metafield namespace/key (only for `to: 'metafield'`). Namespace
             * defaults to the app-reserved `$app:superapp` at compile time.
             */
            namespace: z.string().max(60).optional(),
            metafieldKey: z.string().max(60).optional(),
          })
          .optional(),
      }),
    )
    .max(20)
    .optional(),
  /** Non-interactive layout/presentation blocks. Render on both surfaces. */
  layout: z
    .array(
      z.object({
        kind: z.enum(CHECKOUT_LAYOUT_KINDS),
        text: z.string().max(400).optional(),
        tone: CheckoutToneEnum.optional(),
        /** progress-bar: 0..1 fraction complete. */
        value: z.number().min(0).max(1).optional(),
        /** trust-badges: badge labels. */
        badges: z.array(z.string().min(1).max(40)).max(10).optional(),
        /** payment-icons: icon type identifiers. */
        icons: z.array(z.enum(CHECKOUT_PAYMENT_ICON_TYPES)).max(12).optional(),
        /** countdown: ISO end timestamp (rendered as static text, no live timer). */
        endsAt: z.string().max(40).optional(),
        /** testimonial: attribution line. */
        attribution: z.string().max(120).optional(),
      }),
    )
    .max(20)
    .optional(),
  /**
   * Protected-customer-data access level the block relies on. DECLARATION only —
   * access is granted app-wide (shopify.app.toml + Partner data-protection request);
   * surfaced to the merchant as a note. Defaults to `none`.
   */
  protectedData: z.enum(CHECKOUT_PROTECTED_DATA_LEVELS).optional(),
} as const;

export const RecipeSpecSchema = z.discriminatedUnion('type', [
  /**
   * Generic, unrestricted storefront section / theme app extension.
   * Merchants can build ANY section: `kind` is a free-form recommendation tag
   * (e.g. 'hero', 'faq', 'lookbook', 'custom'), `fieldSchema` declares the
   * section's own typed settings (reuses the DataModel field system), `blocks`
   * holds repeatable content, and `advancedCustom` is the sanitized HTML/CSS/JS
   * escape hatch. Named theme.* types are presets of this. Not a fixed category.
   */
  Base.extend({
    type: z.literal('theme.section'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['THEME_ASSETS']),
    config: z.object({
      /** Free-form recommendation tag — NOT an enum. Drives preview/recommendations only. */
      kind: z.string().min(1).max(60).default('custom'),
      /**
       * How the section activates on the storefront.
       *  - 'section'/'global'/'overlay' → rendered in the page BODY (block or app embed).
       *  - 'head' → injected into the document `<head>` via the head app-embed, for
       *    head-only kinds (JSON-LD structured data, meta/OG tags, resource preload,
       *    pixel bootstrap, consent scripts). Head modules have no visible markup.
       */
      activation: z.enum(['section', 'global', 'overlay', 'head']).default('section'),
      title: z.string().max(LIMITS.nameMax).optional(),
      subtitle: z.string().max(LIMITS.subheadingMax).optional(),
      /** The section's own typed settings, declared inline (reuses DataModel). */
      fieldSchema: DataModelSchema.optional(),
      /** Values for the declared fields, bound at render time. */
      fields: z.record(z.unknown()).default({}),
      /** Repeatable content blocks for list/grid-style sections. */
      blocks: z.array(z.object({
        kind: z.string().min(1).max(40),
        text: z.string().max(2000).optional(),
        imageUrl: z.string().url().optional(),
        url: z.string().url().optional(),
        fields: z.record(z.unknown()).optional(),
      })).max(50).default([]),
      audience: AudiencePackSchema.optional(),
      schedule: SchedulePackSchema.optional(),
      /**
       * Layout archetype (R2.5). `layout.layout` is a per-type enum: loose
       * `z.string()` here (cross-type recipes coexist; old recipes without it
       * still validate), tightened to the type's option-set at generation time.
       */
      layout: LayoutArchetypePackSchema.optional(),
      /**
       * Display rules (R2.1). An ordered, AND/OR-combined list of constrained
       * `{object, attribute, operator, value}` conditions that gate whether this
       * module shows on the storefront (evaluated server-side in Liquid + finished
       * client-side in `superapp-modules.js`). Optional + `enabled:false` by
       * default → absent/disabled renders byte-identically (always show).
       */
      ruleEngine: RuleEnginePackSchema.optional(),
      /**
       * Recommendation source (R2.3). How a product-widget section chooses which
       * products to offer: a strategy select (manual/collection/related/
       * complementary/cart-derived resolve STATICALLY in Liquid with no service;
       * top-sellers/trending/buy-it-again/recently-viewed are DYNAMIC and degrade
       * to `fallback`). Optional + back-compat: absent = no recommendations widget.
       */
      recommendation: RecommendationPackSchema.optional(),
      /**
       * Cart-goal / free-shipping PROGRESS BAR (V-B B1). 1–3 reward tiers with
       * token-aware before/after copy; the storefront computes live progress from
       * `/cart.js`. Read by `kind: 'progress-bar'`. Optional + back-compat: absent =
       * no progress bar (the older `kind: 'progress'` announcement band is untouched).
       */
      progressGoal: ProgressGoalPackSchema.optional(),
      /** Sanitized custom markup/styles/scripts (scoped + CSP-bound at compile/preview). */
      advancedCustom: AdvancedCustomPackSchema.optional(),
    // Open section: `.catchall` accepts kind-specific keys (collapsed from the former
    // named theme.* types) so kind renderers can read them. Structured fields/blocks
    // remain the recommended path.
    }).catchall(z.unknown()),
    placement: PlacementSchema,
    style: StorefrontStyleSchema.optional(),
  }),

  // theme.banner / theme.popup / theme.notificationBar / theme.contactForm collapsed into
  // theme.section (kind: 'banner' | 'popup' | 'notification-bar' | 'contactForm' | 'effect' | 'floatingWidget') — Module System v2.

  Base.extend({
    type: z.literal('proxy.widget'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['APP_PROXY']),
    config: z.object({
      widgetId: z.string().regex(/^[a-z0-9\-]{3,40}$/),
      mode: z.enum(PROXY_WIDGET_MODES).default('HTML'),
      title: z.string().min(LIMITS.headingMin).max(LIMITS.nameMax),
      message: z.string().min(0).max(LIMITS.popupBodyMax).optional(),
      /**
       * Render surface (034 build #6). Every proxy widget is served at the app's single,
       * fixed app-proxy subpath — `/apps/superapp/<widgetId>` (the app has ONE app_proxy;
       * see shopify.app.toml [app_proxy].subpath). Default `'embed'` = the embeddable
       * fragment (back-compat: absent = embed, byte-identical). `'full_page'` = the proxy
       * loader renders WITHOUT the theme layout wrapper (`layout:false`) so the same
       * `/apps/superapp/<widgetId>` URL reads as a first-class store page (lookbook,
       * stockist locator, quiz) rather than a widget embedded in another page.
       */
      surface: z.enum(['embed', 'full_page']).default('embed'),
      /**
       * Display rules (R2.1). Same pack as theme.section — an app-proxy widget can
       * gate server-side in its proxy loader (the strongest evaluation site, since
       * the proxy has the authenticated customer + cart). Optional + back-compat.
       */
      ruleEngine: RuleEnginePackSchema.optional(),
    }),
    placement: PlacementSchema,
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('functions.discountRules'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default(['DISCOUNT_FUNCTION']),
    config: z.object({
      rules: z.array(z.object({
        when: z.object({
          customerTags: z.array(z.string()).optional(),
          minSubtotal: z.number().nonnegative().optional(),
          skuIn: z.array(z.string()).optional(),
        }),
        apply: z.object({
          percentageOff: z.number().min(0).max(100).optional(),
          fixedAmountOff: z.number().nonnegative().optional(),
        }),
      })).min(LIMITS.rulesMin).max(LIMITS.rulesMax),
      combineWithOtherDiscounts: z.boolean().default(true),
      /**
       * Pricing vocabulary (R2.2). Optional; when present it SUPERSEDES `rules[]`:
       * the compiler deterministically lowers `pricing` into the Function's
       * `rules`/`combinesWith` config (tiers → one rule per row, mixed kinds
       * survive). Omitting it keeps the legacy `rules[]` path byte-identical.
       */
      pricing: PricingPackSchema.optional(),
    }),
  }),

  Base.extend({
    type: z.literal('functions.deliveryCustomization'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default(['SHIPPING_FUNCTION']),
    config: z.object({
      rules: z.array(z.object({
        // Predicates are ANDed; an omitted predicate is not a constraint. Beyond
        // country/subtotal, the crate now targets by cart contents and customer
        // (Build #14b). Tag/collection targeting is expressed via product
        // type/vendor/id because `hasTags`/`inAnyCollection` require static input
        // -query args and can't be config-driven — see the crate's module note.
        when: z.object({
          countryCodeIn: z.array(z.string().min(2).max(2)).optional(),
          provinceCodeIn: z.array(z.string().min(1).max(10)).optional(),
          minSubtotal: z.number().nonnegative().optional(),
          productVariantIdIn: z.array(z.string().regex(PRODUCT_VARIANT_GID_RE)).optional(),
          productIdIn: z.array(z.string().regex(PRODUCT_GID_RE)).optional(),
          productTypeIn: z.array(z.string().min(1).max(120)).optional(),
          vendorIn: z.array(z.string().min(1).max(120)).optional(),
          customerIdIn: z.array(z.string().regex(CUSTOMER_GID_RE)).optional(),
          customerEmailIn: z.array(z.string().email()).optional(),
          minCustomerOrders: z.number().int().nonnegative().optional(),
        }),
        actions: z.object({
          hideMethodsContaining: z.array(z.string()).optional(),
          renameMethod: z.object({ contains: z.string().min(1), to: z.string().min(1).max(60) }).optional(),
          reorderPriority: z.number().int().min(0).max(100).optional(),
        }),
      })).min(LIMITS.rulesMin).max(LIMITS.rulesMax),
    }),
  }),

  Base.extend({
    type: z.literal('functions.paymentCustomization'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default(['PAYMENT_CUSTOMIZATION_FUNCTION']),
    config: z.object({
      rules: z.array(z.object({
        // Predicates are ANDed; an omitted predicate is not a constraint. Beyond
        // subtotal/currency, the crate now targets by destination address and
        // cart contents (Build #14b).
        when: z.object({
          minSubtotal: z.number().nonnegative().optional(),
          currencyIn: z.array(z.string().min(3).max(3)).optional(),
          countryCodeIn: z.array(z.string().min(2).max(2)).optional(),
          provinceCodeIn: z.array(z.string().min(1).max(10)).optional(),
          productIdIn: z.array(z.string().regex(PRODUCT_GID_RE)).optional(),
          productTypeIn: z.array(z.string().min(1).max(120)).optional(),
          vendorIn: z.array(z.string().min(1).max(120)).optional(),
        }),
        actions: z.object({
          hideMethodsContaining: z.array(z.string()).optional(),
          renameMethod: z.object({ contains: z.string().min(1), to: z.string().min(1).max(60) }).optional(),
          reorderPriority: z.number().int().min(0).max(100).optional(),
          requireReview: z.boolean().optional(),
        }),
      })).min(LIMITS.rulesMin).max(LIMITS.rulesMax),
    }),
  }),

  Base.extend({
    type: z.literal('functions.cartAndCheckoutValidation'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default(['VALIDATION_FUNCTION']),
    config: z.object({
      rules: z.array(z.object({
        // A rule fires only when every specified condition holds (AND) and at
        // least one is specified. `maxQuantityPerProductType` is the runtime
        // -evaluable stand-in for "per-collection quantity" (Build #14b).
        when: z.object({
          maxQuantityPerSku: z.number().int().positive().optional(),
          maxQuantityPerProductType: z.number().int().positive().optional(),
          minCartValue: z.number().nonnegative().optional(),
          maxCartValue: z.number().nonnegative().optional(),
          blockCountryCodes: z.array(z.string().min(2).max(2)).optional(),
          blockProvinceCodes: z.array(z.string().min(1).max(10)).optional(),
        }),
        errorMessage: z.string().min(1).max(120),
      })).min(LIMITS.rulesMin).max(LIMITS.rulesMax),
    }),
  }),

  Base.extend({
    type: z.literal('functions.cartTransform'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default(['CART_TRANSFORM_FUNCTION_UPDATE']),
    config: z.object({
      mode: z.enum(CART_TRANSFORM_MODES).default('BUNDLE'),
      bundles: z.array(z.object({
        title: z.string().min(1).max(60),
        componentSkus: z.array(z.string()).min(2).max(20),
        bundleSku: z.string().min(1),
        /**
         * Per-bundle pricing (R2.2). Optional; lets a bundle carry its own
         * tier/price. Lowered to a price directive on the merged line. Omitting it
         * emits the bundle exactly as before (title/componentSkus/bundleSku).
         */
        pricing: PricingPackSchema.optional(),
      })).min(LIMITS.bundlesMin).max(LIMITS.bundlesMax),
      // If the store is not Plus, we can optionally publish a *theme-only* fallback
      // to provide UI guidance (not true cart transforms).
      fallbackTheme: z.object({
        enabled: z.boolean().default(true),
        notificationMessage: z.string().min(1).max(140).default('Bundling requires Shopify Plus.'),
      }).default({ enabled: true, notificationMessage: 'Bundling requires Shopify Plus.' }),
      /**
       * Root-level pricing (R2.2). Applies to the whole cart-transform module when
       * a single price policy governs all bundles. Per-bundle `pricing` (above)
       * takes precedence for that bundle. Optional + back-compat.
       */
      pricing: PricingPackSchema.optional(),
    }),
  }),

  Base.extend({
    type: z.literal('functions.fulfillmentConstraints'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      rules: z.array(z.object({
        when: z.object({
          // `productTagIn` is parsed-but-inert (tag lookups need static input
          // -query args); `skuIn` is the supported matcher.
          productTagIn: z.array(z.string()).optional(),
          skuIn: z.array(z.string()).optional(),
        }),
        apply: z.object({
          shipAlone: z.boolean().optional(),
          groupWithTag: z.string().optional(),
          // Build #14b: the SKU-matched lines must fulfill from one of these
          // locations (`deliverableLinesMustFulfillFromAdd`).
          mustFulfillFromLocationIds: z.array(z.string().regex(LOCATION_GID_RE)).optional(),
        }),
      })).min(LIMITS.rulesMin).max(LIMITS.rulesMax),
    }),
  }),

  Base.extend({
    type: z.literal('functions.orderRoutingLocationRule'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      rules: z.array(z.object({
        when: z.object({
          inventoryLocationIds: z.array(z.string()).optional(),
          countryCode: z.string().min(2).max(2).optional(),
        }),
        apply: z.object({
          preferLocationId: z.string().optional(),
          priority: z.number().int().min(0).max(100).optional(),
        }),
      })).min(LIMITS.rulesMin).max(LIMITS.rulesMax),
    }),
  }),

  // Shipping-discount Function (unified Discount API, SHIPPING class). Waives or
  // discounts delivery via cart.delivery-options.discounts.generate.run — the ONLY
  // Shopify Function target that can change shipping cost. Backed by the
  // extensions/superapp-shipping-discount crate. A `free-shipping` pricing rule lowers
  // into `config.rules` here (see compiler/pricing/lower.ts lowerPricingToShippingDiscount).
  Base.extend({
    type: z.literal('functions.shippingDiscount'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default(['SHIPPING_FUNCTION']),
    config: z.object({
      // Wire format the wasm handler reads (mirrors the crate's `Configuration`).
      // Each rule waives/discounts delivery for groups whose gate holds.
      rules: z.array(z.object({
        when: z.object({
          minSubtotal: z.number().nonnegative().optional(),
          minQty: z.number().int().positive().optional(),
          countryCodeIn: z.array(z.string().min(2).max(2)).optional(),
          customerTags: z.array(z.string()).optional(),
        }),
        apply: z.object({
          /** Percentage off shipping. 100 = free shipping; a partial value = discounted delivery. */
          shippingPercentage: z.number().min(0).max(100),
        }),
      })).min(LIMITS.rulesMin).max(LIMITS.rulesMax),
      /**
       * Pricing vocabulary (R2.2). Optional; when present it SUPERSEDES `rules[]`:
       * the compiler lowers a `free-shipping` (or discounted-delivery) pricing block
       * into the Function's `rules` config via `lowerPricingToShippingDiscount`.
       * Omitting it keeps the explicit `rules[]` path byte-identical.
       */
      pricing: PricingPackSchema.optional(),
    }),
  }),

  // Local Pickup delivery-option generator Function (BOPIS). GENERATES local-pickup
  // options at checkout via purchase.local-pickup-delivery-option-generator.run, backed
  // by the extensions/superapp-local-pickup crate. NOTE: the API is currently only on
  // Shopify's `unstable` version (verified 2026-07-04 via dev MCP; NOT in 2026-04), so
  // eligibility classifies this type `needs_runtime` until it ships on a stable version.
  Base.extend({
    type: z.literal('functions.localPickupDeliveryOption'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default(['SHIPPING_FUNCTION']),
    config: z.object({
      // Wire format the wasm handler reads (mirrors the crate's `Configuration`). Each
      // entry adds a local-pickup option for a store location.
      locations: z.array(z.object({
        /** Shopify location GID to offer local pickup at. */
        locationId: z.string().min(1),
        /** Optional pickup cost (major units). Absent = free. */
        cost: z.number().nonnegative().optional(),
        /** Optional option title (defaults to the location name). */
        title: z.string().min(1).max(80).optional(),
        /** Optional pickup instruction shown at checkout. */
        pickupInstruction: z.string().min(1).max(240).optional(),
      })).min(1).max(LIMITS.rulesMax),
    }),
  }),

  // Pickup Point delivery-option generator Function (parcel lockers / post offices).
  // GENERATES third-party pickup-point options at checkout via
  // purchase.pickup-point-delivery-option-generator.run, backed by the
  // extensions/superapp-pickup-point crate. NOTE: the API is currently only on Shopify's
  // `unstable` version (verified 2026-07-04 via dev MCP; NOT in 2026-04), so eligibility
  // classifies this type `needs_runtime` until it ships on a stable version.
  Base.extend({
    type: z.literal('functions.pickupPointDeliveryOption'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default(['SHIPPING_FUNCTION']),
    config: z.object({
      // Wire format the wasm handler reads (mirrors the crate's `Configuration`). Each
      // point carries its full third-party identity because it is a real physical drop-off.
      points: z.array(z.object({
        /** Third-party service's unique id for the point. */
        externalId: z.string().min(1),
        /** Display name of the point. */
        name: z.string().min(1).max(120),
        /** Optional cost (major units). Absent = location's default price. */
        cost: z.number().nonnegative().optional(),
        provider: z.object({
          name: z.string().min(1).max(80),
          /** Provider logo URL (required by the output type). */
          logoUrl: z.string().url(),
        }),
        address: z.object({
          address1: z.string().min(1),
          address2: z.string().optional(),
          city: z.string().min(1),
          countryCode: z.string().min(2).max(2),
          province: z.string().optional(),
          provinceCode: z.string().optional(),
          zip: z.string().optional(),
          phone: z.string().optional(),
          latitude: z.number(),
          longitude: z.number(),
        }),
        /** Destination country codes this point is offered to (empty = any). */
        countryCodeIn: z.array(z.string().min(2).max(2)).optional(),
      })).min(1).max(LIMITS.rulesMax),
    }),
  }),

  Base.extend({
    type: z.literal('checkout.upsell'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['CHECKOUT_UI_INFO_SHIP_PAY']),
    config: z.object({
      offerTitle: z.string().min(LIMITS.offerTitleMin).max(60),
      productVariantGid: z.string().min(10),
      discountPercent: z.number().min(0).max(100).default(0),
      /**
       * Recommendation source (R2.3). Lets the upsell CHOOSE its product by
       * strategy instead of a single pasted variant. Legacy `productVariantGid`
       * stays required (it IS `strategy:'manual'` with one variant); the checkout
       * hook resolves static strategies via the Storefront API and degrades dynamic
       * ones to `fallback`. Optional + back-compat.
       */
      recommendation: RecommendationPackSchema.optional(),
    }),
    // Buyer-facing surface → carries the two-pack module design system so the
    // upsell block matches the merchant's storefront/checkout brand (2026-07-10).
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('checkout.block'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['CHECKOUT_UI_INFO_SHIP_PAY']),
    config: z.object({
      target: z.enum(CHECKOUT_UI_TARGETS),
      title: z.string().min(LIMITS.headingMin).max(LIMITS.nameMax),
      message: z.string().max(LIMITS.checkoutBlockMessageMax).optional(),
      productVariantGid: z.string().min(10).optional(),
      /** Recommendation source (R2.3). Optional + back-compat; see checkout.upsell. */
      recommendation: RecommendationPackSchema.optional(),
      /**
       * Declarative render vocab (build #2, 034) — interactive buyer-input fields,
       * layout/presentation blocks, and a protected-customer-data declaration. All
       * optional so the legacy heading/message/product block is byte-identical.
       */
      ...CheckoutContentShape,
    }),
    // Buyer-facing surface → carries the two-pack module design system.
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('postPurchase.offer'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['CHECKOUT_UI_INFO_SHIP_PAY']),
    config: z.object({
      offerTitle: z.string().min(LIMITS.offerTitleMin).max(LIMITS.offerTitleMax),
      productVariantGid: z.string().min(10).optional(),
      message: z.string().max(LIMITS.offerMessageMax).optional(),
      /** Recommendation source (R2.3). Optional + back-compat; see checkout.upsell. */
      recommendation: RecommendationPackSchema.optional(),
    }),
    // Buyer-facing surface → carries the two-pack module design system.
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('admin.block'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      target: z.enum(ADMIN_BLOCK_TARGETS),
      label: z.string().min(LIMITS.labelMin).max(LIMITS.labelMax),
      shouldRender: z.boolean().optional(),
      /**
       * Declarative presentational content the generic admin UI extension renders
       * with Polaris `s-*` web components (blocks read this from the persisted
       * `$app:superapp_admin_block` metaobject; see extensions/admin-ui). All fields
       * are optional so the thin `{target,label}` blocks stay valid.
       */
      ...AdminContentShape,
    }),
  }),

  Base.extend({
    type: z.literal('admin.action'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      /** Shopify admin surface target, e.g. 'admin.order-details.action.render' */
      target: z.enum(ADMIN_ACTION_TARGETS),
      /** Text shown in the "More actions" menu entry. */
      label: z.string().min(LIMITS.labelMin).max(LIMITS.labelMax),
      /** Optional heading displayed inside the action modal. Defaults to label if omitted. */
      title: z.string().min(1).max(60).optional(),
      /**
       * Declarative presentational content rendered inside the action modal by the
       * generic admin UI extension (read from `$app:superapp_admin_action`). Optional.
       */
      ...AdminContentShape,
    }),
  }),

  // Spring 2026 Discount UI Extension — an admin UI that configures a discount
  // (pairs with a functions.discountRules Function). Declarative today.
  Base.extend({
    type: z.literal('admin.discountUi'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      /** Title shown in the discount admin UI. */
      title: z.string().min(1).max(80),
      /** Which discount class this UI configures. */
      discountClass: z.enum(['product', 'order', 'shipping']).default('product'),
      /** Handle of the paired discount Function (functions.discountRules), if any. */
      functionHandle: z.string().max(120).optional(),
      /** Merchant-facing description of what the discount does. */
      description: z.string().max(400).optional(),
      /** Admin form fields the extension exposes. */
      fields: z.array(z.object({
        key: z.string().min(1).max(60),
        label: z.string().min(1).max(80),
        kind: z.enum(['text', 'number', 'toggle', 'select']).default('text'),
      })).max(20).default([]),
    }),
  }),

  // Admin link extension (`admin_link` type). A deep link from an admin resource page
  // to a page of the app. Distinct Shopify extension TYPE — NOT a ui_extension: the
  // deploy IS the toml registration (`target` + relative `url`; Shopify appends the
  // store + selected-resource id at click time). Config-driven registration in the
  // shipped admin-link extension family. No runtime bundle to render.
  Base.extend({
    type: z.literal('admin.link'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      /** Which admin resource page (or the resource-independent app-intent target) hosts the link. */
      target: z.enum(ADMIN_LINK_TARGETS),
      /** Merchant-facing link label shown in the admin. */
      label: z.string().min(LIMITS.labelMin).max(LIMITS.labelMax),
      /**
       * Relative app path the link opens (e.g. `/app/orders/reconcile`). Shopify appends
       * `shop` + selected-resource id URL params at invocation, so the app page can key
       * off the resource. A single leading-slash relative path; no external URLs.
       */
      url: z.string().min(1).max(2000).regex(/^\/[^\s]*$/, 'url must be a relative app path starting with "/"'),
    }),
  }),

  // Admin print extension (`admin_print` / Print Action Extension API). Produces a
  // custom printable document (packing slip / invoice / label / pick list) for orders
  // and products. The shipped admin-print extension renders an `s-admin-print-action`
  // whose `src` points at the app's `/admin-print/document` route, parameterized by
  // the published config (documentKind + title + which resource ids). Config-driven —
  // no per-module bundle. Publishing persists the config the print route reads.
  Base.extend({
    type: z.literal('admin.print'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      /** One of the four print-action render targets (order/product · details/index-selection). */
      target: z.enum(ADMIN_PRINT_TARGETS),
      /** Menu label shown in the admin print-action list. */
      label: z.string().min(LIMITS.labelMin).max(LIMITS.labelMax),
      /** Which document the app produces. Drives the print-document renderer + preview. */
      documentKind: z.enum(ADMIN_PRINT_DOCUMENT_KINDS).default('packing-slip'),
      /** Document title/heading printed on the page. */
      title: z.string().min(1).max(120),
      /** Optional sub-line / merchant note printed under the title. */
      subtitle: z.string().max(240).optional(),
      /**
       * Optional print-document body template. `{{order.name}}` / `{{product.title}}`
       * style placeholders are resolved by the app's print route at render time. Omit →
       * the renderer uses the documentKind's default layout.
       */
      bodyTemplate: z.string().max(8000).optional(),
      /** Whether to include the shop logo/header block in the printed doc. */
      includeShopHeader: z.boolean().default(true),
    }),
  }),

  // Customer-segment template extension (admin.customers.segmentation-templates.data).
  // A runnable data extension that returns pre-built segment query templates into the
  // segment editor's template gallery. Config-driven: the shipped segment-template
  // extension reads the published templates and returns them verbatim. Each template's
  // `query` uses ShopifyQL-style segment syntax (e.g. `number_of_orders >= 5`).
  Base.extend({
    type: z.literal('admin.segmentTemplate'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      /** The single runnable target for segment-template data extensions. */
      target: z.literal('admin.customers.segmentation-templates.data').default('admin.customers.segmentation-templates.data'),
      /** The segment query templates surfaced in the editor gallery. */
      templates: z
        .array(
          z.object({
            /** Template card title. */
            title: z.string().min(1).max(80),
            /** One-line explanation of who the segment matches. */
            description: z.string().min(1).max(240),
            /** The segment query inserted on one click (segment editor syntax). */
            query: z.string().min(1).max(2000),
          }),
        )
        .min(1)
        .max(20),
    }),
  }),

  Base.extend({
    type: z.literal('pos.extension'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    requires: z.array(z.custom<Capability>()).default([]),
    // POS UI extension config. `target`/`label`/`blockKind` are the original shipped
    // fields (back-compat); everything below is additive and OPTIONAL — an existing POS
    // module that only sets those three renders exactly as before. The shipped generic
    // block (`extensions/superapp-pos-block`) reads this via `/api/pos/config` and both
    // renders (bound `binding`/`label`) and acts (`action`) from it; unresolvable
    // actions/bindings degrade gracefully.
    config: z.object({
      target: z.enum(POS_TARGETS),
      label: z.string().min(LIMITS.labelMin).max(LIMITS.labelMax),
      blockKind: z.enum(POS_BLOCK_KINDS).optional(),
      /** The tile↔modal / menu-item↔action pairing this module uses (default derived from target). */
      presentation: z.enum(POS_PRESENTATIONS).optional(),
      /** Behaviour performed when tapped (discount, note, loyalty, receipt, etc.). Default NONE. */
      action: z.enum(POS_ACTIONS).optional(),
      /** A live value the block renders (falls back to `label` when unresolvable). */
      binding: z.enum(POS_DATA_BINDINGS).optional(),
      /**
       * Require a staff PIN (PinPad API) before the action runs — gates sensitive ops such as
       * discounts, voids, or loyalty writes. `role` optionally narrows to a POS staff role/permission
       * the app proxy verifies; `reason` is shown on the PIN prompt.
       */
      staffPin: z
        .object({
          required: z.boolean().default(true),
          reason: z.string().max(120).optional(),
          role: z.string().max(60).optional(),
        })
        .optional(),
      /** Parameters for the declared `action` (discount amount, product to add, receipt text, etc.). */
      actionConfig: z
        .object({
          /** Discount / line-discount title shown in POS. */
          discountTitle: z.string().max(80).optional(),
          /** Percentage (e.g. "10") or fixed amount (e.g. "5.00"); omit for Code discounts. */
          discountAmount: z.string().max(20).optional(),
          /** Discount code for APPLY_CODE_DISCOUNT. */
          discountCode: z.string().max(80).optional(),
          /** Note text for SET_CART_NOTE. */
          note: z.string().max(500).optional(),
          /** Property key/value for ADD_CART_PROPERTY. */
          propertyKey: z.string().max(80).optional(),
          propertyValue: z.string().max(500).optional(),
          /**
           * Product variant to add for ADD_LINE_ITEM. Authored as the canonical variant GID
           * (`gid://shopify/ProductVariant/<n>`), matching the rest of the corpus; a bare
           * numeric id is also accepted. The POS runtime (`shopify.addLineItem`) requires a
           * NUMERIC variant id, so `posBehavior.numericIdFromGid` extracts it at call time.
           */
          productVariantId: z
            .string()
            .regex(/^(?:gid:\/\/shopify\/ProductVariant\/\d+|\d+)$/)
            .optional(),
          /** Discount type for APPLY_CART_DISCOUNT / APPLY_LINE_DISCOUNT ('Percentage'|'FixedAmount'). */
          discountKind: z.enum(['Percentage', 'FixedAmount']).optional(),
          /** Static/bound content for RECEIPT_CONTENT (header/footer). */
          receiptText: z.string().max(500).optional(),
          /** Print source for PRINT: an app-proxy path or a full https URL to the app backend. */
          url: z.string().max(500).optional(),
        })
        .optional(),
      /**
       * App-proxy endpoint the block reads/writes for LOYALTY_READ / LOYALTY_WRITE / APP_PROXY_POST
       * and for resolving `loyalty.*` bindings. Relative to the app; verified by the app proxy.
       */
      appProxyPath: z
        .string()
        .regex(/^\/[a-z0-9\-/]{1,200}$/)
        .optional(),
      /**
       * For an `*.event.observe` module: the POS event to subscribe to and where to forward it.
       * `target` must be the matching `pos.<event>.event.observe` target. The observer is UI-less
       * and forwards the event context to `forwardTo` (an app-proxy path).
       */
      observe: z
        .object({
          event: z.enum(POS_OBSERVE_EVENTS),
          forwardTo: z
            .string()
            .regex(/^\/[a-z0-9\-/]{1,200}$/)
            .optional(),
        })
        .optional(),
    }),
  }),

  Base.extend({
    type: z.literal('analytics.pixel'),
    category: z.literal('INTEGRATION').default('INTEGRATION'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      events: z.array(z.enum(PIXEL_STANDARD_EVENTS)).min(1),
      pixelId: z.string().max(80).optional(),
      mapping: z.record(z.string(), z.string()).optional(),
    }),
  }),

  Base.extend({
    type: z.literal('integration.httpSync'),
    category: z.literal('INTEGRATION').default('INTEGRATION'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      connectorId: z.string().min(1),
      endpointPath: z.string().regex(new RegExp(`^/[a-z0-9\\-/]{${LIMITS.integrationEndpointPathMin},${LIMITS.integrationEndpointPathMax}}$`)),
      trigger: z.enum(INTEGRATION_HTTP_SYNC_TRIGGERS),
      payloadMapping: z.record(z.string(), z.string()).default({}),
    }),
  }),

  Base.extend({
    type: z.literal('flow.automation'),
    category: z.literal('FLOW').default('FLOW'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      trigger: z.enum(FLOW_AUTOMATION_TRIGGERS),
      steps: z.array(z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('HTTP_REQUEST'),
          connectorId: z.string().min(1),
          path: z.string().regex(/^\/[a-z0-9\-\/]{1,200}$/),
          method: z.enum(HTTP_METHODS).default('POST'),
          bodyMapping: z.record(z.string(), z.string()).default({}),
        }),
        z.object({
          kind: z.literal('SEND_HTTP_REQUEST'),
          url: z.string().url().refine(u => u.startsWith('https://'), { message: 'Only HTTPS URLs allowed' }),
          method: z.enum(HTTP_METHODS_EXTENDED).default('POST'),
          headers: z.record(z.string(), z.string()).default({}),
          body: z.string().max(50_000).optional(),
          authType: z.enum(HTTP_AUTH_TYPES).default('none'),
          authConfig: z.object({
            username: z.string().optional(),
            password: z.string().optional(),
            token: z.string().optional(),
            headerName: z.string().optional(),
            headerValue: z.string().optional(),
          }).optional(),
        }),
        z.object({
          kind: z.literal('TAG_CUSTOMER'),
          tag: z.string().min(1).max(40),
        }),
        z.object({
          kind: z.literal('ADD_ORDER_NOTE'),
          note: z.string().min(1).max(240),
        }),
        z.object({
          kind: z.literal('WRITE_TO_STORE'),
          storeKey: z.string().min(1).max(40),
          titleExpr: z.string().max(200).optional(),
          payloadMapping: z.record(z.string(), z.string()).default({}),
        }),
        z.object({
          kind: z.literal('SEND_EMAIL_NOTIFICATION'),
          to: z.string().email(),
          subject: z.string().min(1).max(200),
          body: z.string().min(1).max(10_000),
        }),
        z.object({
          kind: z.literal('TAG_ORDER'),
          tags: z.string().min(1).max(200),
        }),
        z.object({
          kind: z.literal('SEND_SLACK_MESSAGE'),
          // Slack incoming webhooks are bound to a channel at creation, so the
          // webhook URL is what routes the message; `channel` is an optional
          // human label. Falls back to SLACK_WEBHOOK_URL when webhookUrl omitted.
          webhookUrl: z.string().url().optional(),
          channel: z.string().max(100).optional(),
          text: z.string().min(1).max(4000),
        }),
        z.object({
          kind: z.literal('CONDITION'),
          field: z.string().min(1),
          operator: z.enum(CONDITION_OPERATORS),
          value: z.union([z.string(), z.number(), z.boolean()]).optional(),
          thenSteps: z.array(z.lazy(() => z.any())).optional(),
          elseSteps: z.array(z.lazy(() => z.any())).optional(),
        }),
        // R3.5 durable scheduler: a relative per-entity wait. When the runner
        // reaches a DELAY longer than an inline threshold it PARKS the remaining
        // steps into a durable WorkflowRun (status WAITING + resumeAt) instead of
        // blocking; a cron resume sweep continues them. Additive — a flow with no
        // DELAY step behaves exactly as before.
        //
        // The mode/field pairing (duration ⇒ durationMs, until ⇒ until) is
        // enforced by the config-level superRefine below — a per-member `.refine`
        // would wrap this in ZodEffects, which `discriminatedUnion` rejects.
        z.object({
          kind: z.literal('DELAY'),
          // Exactly one mode. `duration` = relative wait from when the step is
          // reached (v1). `until` = an ISO-8601 instant or a {{dot.path}} ref
          // (modeled; the live runner defers it per Decision A).
          mode: z.enum(FLOW_DELAY_MODES).default('duration'),
          durationMs: z.number().int()
            .min(FLOW_DELAY_LIMITS.durationMsMin)
            .max(FLOW_DELAY_LIMITS.durationMsMax)
            .optional(),
          until: z.string().max(FLOW_DELAY_LIMITS.untilMax).optional(),
        }),
      ])).min(LIMITS.flowStepsMin).max(LIMITS.flowStepsMax),
    }).superRefine((cfg, ctx) => {
      // Cross-field rule for DELAY steps (kept off the union member so the
      // discriminated union stays a union of plain objects, as Zod requires).
      cfg.steps.forEach((step, i) => {
        if (step.kind !== 'DELAY') return;
        const ok = step.mode === 'duration' ? step.durationMs != null : step.until != null;
        if (!ok) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['steps', i],
            message: 'DELAY requires durationMs (duration mode) or until (until mode)',
          });
        }
      });
    }),
  }),

  Base.extend({
    // First-class messaging surface (R3.4 / M5). The messaging pack IS the config
    // body (flat-pin, post-R2.4 substrate) — email/slack fan-out over a resolved
    // audience, lowering onto the shipped EmailConnector/SlackConnector. SMS/push
    // are accepted by the schema but gated needs_runtime at compile + runtime.
    type: z.literal('messaging.campaign'),
    category: z.literal('INTEGRATION').default('INTEGRATION'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: MessagingPackSchema,
  }),

  // Agentic-commerce surface (M13 / Spring-26). A structured product-data feed the
  // merchant surfaces to AI channels, served by a real app endpoint that mirrors the
  // shipped pos.extension app-served model (publish persists config → an app route
  // reads the active PUBLISHED version → an AI crawler/agent fetches over HTTP). Flat
  // `config` with static resolvers — no runtime that doesn't exist. The `mcp-endpoint`
  // / `agent-profile` / `sponsored-products` artifacts are accepted by the schema but
  // their runtime is deferred (needs_runtime): the compiler names any requested one and
  // publish surfaces the note; only the feed deploys. See specs/031 agentic-surface.md.
  Base.extend({
    type: z.literal('agentic.catalogProfile'),
    category: z.literal('INTEGRATION').default('INTEGRATION'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      /** Which artifacts to produce. `catalog-feed` is the always-real default. */
      artifacts: z.array(z.enum(AGENTIC_ARTIFACTS)).min(1).default(['catalog-feed']),
      /** Product set the feed syndicates. Static, resolver-backed — no free-form query. */
      source: z
        .object({
          kind: z.enum(AGENTIC_PRODUCT_SOURCES).default('all'),
          collectionIds: z
            .array(z.string().regex(COLLECTION_GID_RE))
            .max(AGENTIC_LIMITS.collectionsMax)
            .optional(),
          productIds: z
            .array(z.string().regex(PRODUCT_GID_RE))
            .max(AGENTIC_LIMITS.manualProductsMax)
            .optional(),
        })
        .default({ kind: 'all' }),
      /** attribute-map: map a normalized key ← a product metafield / attribute path. */
      attributeMap: z
        .array(
          z.object({
            key: z.enum(AGENTIC_ATTRIBUTE_KEYS),
            /** e.g. "metafield:custom.gtin" | "vendor" | "productType" | "variant.sku". */
            from: z.string().min(1).max(AGENTIC_LIMITS.attributeFromMax),
          }),
        )
        .max(AGENTIC_LIMITS.attributeMapRowsMax)
        .default([]),
      /** compliance-disclosure: rows appended verbatim to every feed item. */
      disclosures: z
        .array(
          z.object({
            label: z.string().min(1).max(AGENTIC_LIMITS.disclosureLabelMax),
            text: z.string().min(1).max(AGENTIC_LIMITS.disclosureTextMax),
          }),
        )
        .max(AGENTIC_LIMITS.disclosuresMax)
        .default([]),
      /** Public feed handle (URL slug under /agentic/{shop}/<handle>/feed.json). */
      feedHandle: z
        .string()
        .regex(/^[a-z0-9-]{3,40}$/)
        .default('catalog'),
      /**
       * sponsored-products: merchant-promoted product GIDs boosted to the top of the
       * agentic (MCP search / feed) results. Config-only, app-served — no ad exchange.
       * Ignored unless the `sponsored-products` artifact is enabled.
       */
      sponsoredProductIds: z
        .array(z.string().regex(PRODUCT_GID_RE))
        .max(AGENTIC_LIMITS.sponsoredProductsMax)
        .default([]),
      /**
       * agent-profile: free-text instructions surfaced to AI agents in the app-served
       * agent-profile document + agents.md (e.g. "Prioritize fair-trade products.").
       * PUBLIC — never put PII/contact details here (the profile is broadly cached).
       */
      agentInstructions: z
        .string()
        .max(AGENTIC_LIMITS.agentInstructionsMax)
        .optional(),
    }),
  }),

  Base.extend({
    type: z.literal('platform.extensionBlueprint'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      surface: z.enum(BLUEPRINT_SURFACES),
      goal: z.string().min(LIMITS.goalMin).max(LIMITS.goalMax),
      suggestedFiles: z.array(z.string()).min(LIMITS.suggestedFilesMin).max(LIMITS.suggestedFilesMax),
    }),
  }),

  Base.extend({
    type: z.literal('customerAccount.blocks'),
    category: z.literal('CUSTOMER_ACCOUNT').default('CUSTOMER_ACCOUNT'),
    requires: z.array(z.custom<Capability>()).default(['CUSTOMER_ACCOUNT_UI']),
    config: z.object({
      target: z.enum(CUSTOMER_ACCOUNT_TARGETS),
      title: z.string().min(LIMITS.headingMin).max(LIMITS.nameMax),
      blocks: z
        .array(
          z.object({
            kind: z.enum(CUSTOMER_ACCOUNT_BLOCK_KINDS),
            content: z.string().min(0).max(240).optional(),
            url: z.string().url().optional(),
            tone: z.enum(CUSTOMER_ACCOUNT_BLOCK_TONES).optional(),
            /**
             * Build #3 (034) — interactive + data-bound vocab. All optional so the
             * legacy `{ kind, content?, url?, tone? }` block stays valid and renders
             * byte-identically. The shipped generic extension reads these verbatim
             * from the persisted metaobject and degrades gracefully when a bound
             * value or API surface is unavailable.
             */
            /**
             * Bind the rendered value to a live source (Customer Account / Order API
             * or our app-owned points/store-credit). When set, `content` is used as
             * a fallback if the value can't be resolved on the current surface.
             */
            bind: z.enum(CUSTOMER_ACCOUNT_BINDINGS).optional(),
            /** BUTTON: id of the MODAL block this button opens (in-block overlay). */
            modalId: z.string().min(1).max(60).optional(),
            /** MODAL: stable id a BUTTON references via `modalId`. */
            id: z.string().min(1).max(60).optional(),
            /** BUTTON visual variant (Polaris s-button variants). */
            variant: z.enum(['primary', 'secondary', 'tertiary']).optional(),
            /**
             * ACTION (order.action pair): how the menu-item's overlay is presented.
             * `modal` → in-page s-modal (uses this block's `content`/nested); `link`
             * → navigate to `url` (returns portal, app-proxy page, etc.).
             */
            action: z.enum(CUSTOMER_ACCOUNT_ACTION_KINDS).optional(),
            /** FORM: input fields the block renders and submits via the app proxy. */
            fields: z
              .array(
                z.object({
                  kind: z.enum(CUSTOMER_ACCOUNT_FIELD_KINDS).default('text'),
                  key: z
                    .string()
                    .min(1)
                    .max(60)
                    .regex(/^[a-zA-Z0-9_.\-]+$/, 'key must be alphanumeric/underscore/dot/dash'),
                  label: z.string().min(1).max(80),
                  placeholder: z.string().max(120).optional(),
                  required: z.boolean().optional(),
                  options: z
                    .array(z.object({ value: z.string().min(1).max(80), label: z.string().min(1).max(80) }))
                    .max(20)
                    .optional(),
                }),
              )
              .max(12)
              .optional(),
            /**
             * FORM submit target. `proxyPath` is an app-proxy subpath the captured
             * values POST to (e.g. `/apps/superapp/ca/return-request`). Omit → the
             * form collects and displays only (no write).
             */
            submit: z
              .object({
                proxyPath: z.string().min(1).max(200),
                submitLabel: z.string().min(1).max(60).optional(),
              })
              .optional(),
          }),
        )
        .min(LIMITS.customerAccountBlocksMin)
        .max(LIMITS.customerAccountBlocksMax),
      /**
       * Protected-customer-data access the block relies on. DECLARATION only —
       * access is granted app-wide (shopify.app.toml scopes + Partner data-protection
       * request); surfaced to the merchant as a note. Data bindings that read
       * name/email/address need `level2`; id/ordersCount need `level1`.
       */
      protectedData: z.enum(['none', 'level1', 'level2']).optional(),
      b2bOnly: z.boolean().default(false),
    }),
    // Buyer-facing surface → carries the two-pack module design system so account
    // blocks match the merchant's customer-account brand (2026-07-10).
    style: StorefrontStyleSchema.optional(),
  }),
]);

export type RecipeSpec = z.infer<typeof RecipeSpecSchema>;

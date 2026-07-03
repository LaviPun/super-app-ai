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
       * Render surface (034 build #6). Default `'embed'` = the legacy embeddable
       * fragment served at `/apps/<proxySubpath>/<widgetId>` (back-compat: absent =
       * embed, byte-identical). `'full_page'` = a standalone routed page: the proxy
       * loader renders WITHOUT the theme layout wrapper (`layout:false`) at its own
       * routed subpath, so it reads as a first-class store page (e.g. a lookbook,
       * stockist locator, quiz) rather than a widget embedded in another page.
       */
      surface: z.enum(['embed', 'full_page']).default('embed'),
      /**
       * Routed subpath under the app-proxy prefix (`/apps/<proxySubpath>`). A single
       * URL segment (`^[a-z0-9][a-z0-9-]{0,38}$`, e.g. `lookbook`, `stockists`). The
       * proxy loader keys off this so multiple full-page widgets can each own a clean
       * `/apps/<proxySubpath>` route. Absent = the default app-proxy subpath.
       */
      proxySubpath: z.string().regex(/^[a-z0-9][a-z0-9-]{0,38}$/).optional(),
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
        when: z.object({
          countryCodeIn: z.array(z.string().min(2).max(2)).optional(),
          minSubtotal: z.number().nonnegative().optional(),
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
        when: z.object({
          minSubtotal: z.number().nonnegative().optional(),
          currencyIn: z.array(z.string().min(3).max(3)).optional(),
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
        when: z.object({
          maxQuantityPerSku: z.number().int().positive().optional(),
          blockCountryCodes: z.array(z.string().min(2).max(2)).optional(),
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
          productTagIn: z.array(z.string()).optional(),
          skuIn: z.array(z.string()).optional(),
        }),
        apply: z.object({
          shipAlone: z.boolean().optional(),
          groupWithTag: z.string().optional(),
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

  Base.extend({
    type: z.literal('pos.extension'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    requires: z.array(z.custom<Capability>()).default([]),
    config: z.object({
      target: z.enum(POS_TARGETS),
      label: z.string().min(LIMITS.labelMin).max(LIMITS.labelMax),
      blockKind: z.enum(POS_BLOCK_KINDS).optional(),
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
  }),
]);

export type RecipeSpec = z.infer<typeof RecipeSpecSchema>;

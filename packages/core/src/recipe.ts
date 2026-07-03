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
import { DataModelSchema } from './data-model.js';
import type { ModuleCategory, ModuleType } from './allowed-values.js';
import {
  LIMITS,
  THEME_PLACEABLE_TEMPLATES,
  THEME_SECTION_GROUPS,
  CUSTOMER_ACCOUNT_TARGETS,
  CHECKOUT_UI_TARGETS,
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
  CONDITION_OPERATORS,
  CUSTOMER_ACCOUNT_BLOCK_KINDS,
  CUSTOMER_ACCOUNT_BLOCK_TONES,
  BLUEPRINT_SURFACES,
  PROXY_WIDGET_MODES,
  CART_TRANSFORM_MODES,
  POS_BLOCK_KINDS,
  HTTP_METHODS,
  HTTP_METHODS_EXTENDED,
  HTTP_AUTH_TYPES,
  DEPLOY_TARGET_KINDS,
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

/** Where to deploy: theme app extension via metafields (themeId + moduleId) or platform extensions. Doc-aligned. */
export type DeployTarget =
  | { kind: (typeof DEPLOY_TARGET_KINDS)[0]; themeId: string; moduleId?: string }
  | { kind: (typeof DEPLOY_TARGET_KINDS)[1]; moduleId?: string };

export const DeployTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(DEPLOY_TARGET_KINDS[0]),
    themeId: z.string().min(1),
    moduleId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal(DEPLOY_TARGET_KINDS[1]),
    moduleId: z.string().min(1).optional(),
  }),
]);

/** Theme placement: only one of enabled_on or disabled_on (doc 4.2.2B, 4.2.3). */
const PlacementSchema = z
  .object({
    enabled_on: z
      .object({
        templates: z.array(z.enum(THEME_PLACEABLE_TEMPLATES)).optional(),
        groups: z.array(z.enum(THEME_SECTION_GROUPS)).optional(),
      })
      .optional(),
    disabled_on: z
      .object({
        templates: z.array(z.enum(THEME_PLACEABLE_TEMPLATES)).optional(),
        groups: z.array(z.enum(THEME_SECTION_GROUPS)).optional(),
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
});

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
      /** How the section activates on the storefront. */
      activation: z.enum(['section', 'global', 'overlay']).default('section'),
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
      })).min(LIMITS.bundlesMin).max(LIMITS.bundlesMax),
      // If the store is not Plus, we can optionally publish a *theme-only* fallback
      // to provide UI guidance (not true cart transforms).
      fallbackTheme: z.object({
        enabled: z.boolean().default(true),
        notificationMessage: z.string().min(1).max(140).default('Bundling requires Shopify Plus.'),
      }).default({ enabled: true, notificationMessage: 'Bundling requires Shopify Plus.' }),
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

  Base.extend({
    type: z.literal('checkout.upsell'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['CHECKOUT_UI_INFO_SHIP_PAY']),
    config: z.object({
      offerTitle: z.string().min(LIMITS.offerTitleMin).max(60),
      productVariantGid: z.string().min(10),
      discountPercent: z.number().min(0).max(100).default(0),
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
      ])).min(LIMITS.flowStepsMin).max(LIMITS.flowStepsMax),
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
          }),
        )
        .min(LIMITS.customerAccountBlocksMin)
        .max(LIMITS.customerAccountBlocksMax),
      b2bOnly: z.boolean().default(false),
    }),
  }),
]);

export type RecipeSpec = z.infer<typeof RecipeSpecSchema>;

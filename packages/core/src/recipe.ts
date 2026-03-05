/**
 * RecipeSpec schema and deploy types. All type/category/status/deploy enums
 * come from the Allowed Values Manifest (allowed-values.ts) per doc 3.2, 3.3, 4.1.
 */
import { z } from 'zod';
import type { Capability } from './capabilities.js';
import { StorefrontStyleSchema } from './storefront-style.js';
import type { ModuleCategory, ModuleType } from './allowed-values.js';
import {
  LIMITS,
  THEME_PLACEABLE_TEMPLATES,
  THEME_SECTION_GROUPS,
  CUSTOMER_ACCOUNT_TARGETS,
  CHECKOUT_UI_TARGETS,
  ADMIN_TARGETS,
  POS_TARGETS,
  PIXEL_STANDARD_EVENTS,
  MODULE_CATEGORIES,
  RECIPE_SPEC_TYPES,
  POPUP_TRIGGERS,
  POPUP_FREQUENCY,
  POPUP_SHOW_ON_PAGES,
  INTEGRATION_HTTP_SYNC_TRIGGERS,
  FLOW_AUTOMATION_TRIGGERS,
  FLOW_STEP_KINDS,
  CONDITION_OPERATORS,
  CUSTOMER_ACCOUNT_BLOCK_KINDS,
  CUSTOMER_ACCOUNT_BLOCK_TONES,
  BLUEPRINT_SURFACES,
  PROXY_WIDGET_MODES,
  CART_TRANSFORM_MODES,
  THEME_EFFECT_KINDS,
  THEME_EFFECT_INTENSITY,
  THEME_EFFECT_SPEED,
  THEME_EFFECT_START_TRIGGERS,
  THEME_EFFECT_PLACEMENTS,
  THEME_FLOATING_WIDGET_VARIANTS,
  THEME_FLOATING_WIDGET_ACTIONS,
  THEME_FLOATING_WIDGET_ANCHORS,
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
  | { kind: (typeof DEPLOY_TARGET_KINDS)[1] };

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
  Base.extend({
    type: z.literal('theme.banner'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['THEME_ASSETS']),
    config: z.object({
      heading: z.string().min(LIMITS.headingMin).max(LIMITS.headingMax),
      subheading: z.string().min(0).max(LIMITS.subheadingMax).optional(),
      ctaText: z.string().min(0).max(40).optional(),
      ctaUrl: z.string().url().optional(),
      imageUrl: z.string().url().optional(),
      enableAnimation: z.boolean().default(false),
    }),
    placement: PlacementSchema,
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('theme.popup'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['THEME_ASSETS']),
    config: z.object({
      title: z.string().min(LIMITS.popupTitleMin).max(LIMITS.popupTitleMax),
      body: z.string().min(0).max(LIMITS.popupBodyMax).optional(),
      trigger: z.enum(POPUP_TRIGGERS).default('ON_LOAD'),
      delaySeconds: z.number().int().min(0).max(LIMITS.popupDelaySecondsMax).default(0),
      frequency: z.enum(POPUP_FREQUENCY).default('ONCE_PER_DAY'),
      maxShowsPerDay: z.number().int().min(0).max(LIMITS.popupMaxShowsPerDayMax).default(0),
      showOnPages: z.enum(POPUP_SHOW_ON_PAGES).default('ALL'),
      customPageUrls: z.array(z.string().max(LIMITS.popupCustomPageUrlMax)).max(LIMITS.popupCustomPageUrlsMax).default([]),
      autoCloseSeconds: z.number().int().min(0).max(LIMITS.popupDelaySecondsMax).default(0),
      showCloseButton: z.boolean().default(true),
      countdownEnabled: z.boolean().default(false),
      countdownSeconds: z.number().int().min(0).max(LIMITS.popupCountdownSecondsMax).default(0),
      countdownLabel: z.string().max(LIMITS.popupCountdownLabelMax).default(''),
      ctaText: z.string().min(0).max(40).optional(),
      ctaUrl: z.string().url().optional(),
      secondaryCtaText: z.string().max(40).optional(),
      secondaryCtaUrl: z.string().url().optional(),
    }),
    placement: PlacementSchema,
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('theme.notificationBar'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['THEME_ASSETS']),
    config: z.object({
      message: z.string().min(LIMITS.notificationBarMessageMin).max(LIMITS.notificationBarMessageMax),
      linkText: z.string().min(0).max(40).optional(),
      linkUrl: z.string().url().optional(),
      dismissible: z.boolean().default(true),
    }),
    placement: PlacementSchema,
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('theme.effect'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['THEME_ASSETS']),
    config: z.object({
      effectKind: z.enum(THEME_EFFECT_KINDS),
      intensity: z.enum(THEME_EFFECT_INTENSITY).default('medium'),
      speed: z.enum(THEME_EFFECT_SPEED).default('normal'),
      /** When the effect starts playing. Defaults to page_load. */
      startTrigger: z.enum(THEME_EFFECT_START_TRIGGERS).default('page_load'),
      /** How long the effect runs in seconds. 0 = play indefinitely. Max 300. */
      durationSeconds: z.number().int().min(0).max(300).default(0),
      /** Viewport region the overlay covers. */
      overlayPlacement: z.enum(THEME_EFFECT_PLACEMENTS).default('full_screen'),
      /** Disable effect when user prefers reduced motion. Recommended true. */
      reducedMotion: z.boolean().default(true),
    }),
    placement: PlacementSchema,
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('theme.floatingWidget'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['THEME_ASSETS']),
    config: z.object({
      /** What kind of floating widget to render. */
      variant: z.enum(THEME_FLOATING_WIDGET_VARIANTS).default('custom'),
      /** Visible label next to the icon. Optional. */
      label: z.string().min(0).max(60).optional(),
      /** Icon image URL or a named icon. Optional — themes use a default per variant. */
      iconUrl: z.string().url().optional(),
      /** Corner anchor for the widget. */
      anchor: z.enum(THEME_FLOATING_WIDGET_ANCHORS).default('bottom_right'),
      /** Horizontal offset from anchor edge in pixels, -200..200. */
      offsetX: z.number().int().min(-200).max(200).default(24),
      /** Vertical offset from anchor edge in pixels, -200..200. */
      offsetY: z.number().int().min(-200).max(200).default(24),
      /** What happens when the widget is clicked. */
      onClick: z.enum(THEME_FLOATING_WIDGET_ACTIONS).default('open_url'),
      /** Pre-filled message for WhatsApp or chat variants. Optional. */
      message: z.string().min(0).max(500).optional(),
      /** Destination URL for open_url / open_whatsapp onClick. Must be valid URL when provided. */
      url: z.string().url().optional(),
      /** Hide on mobile. */
      hideOnMobile: z.boolean().default(false),
      /** Hide on desktop. */
      hideOnDesktop: z.boolean().default(false),
    }),
    placement: PlacementSchema,
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('proxy.widget'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['APP_PROXY']),
    config: z.object({
      widgetId: z.string().regex(/^[a-z0-9\-]{3,40}$/),
      mode: z.enum(PROXY_WIDGET_MODES).default('HTML'),
      title: z.string().min(LIMITS.headingMin).max(LIMITS.nameMax),
      message: z.string().min(0).max(LIMITS.popupBodyMax).optional(),
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
      target: z.enum(ADMIN_TARGETS),
      label: z.string().min(LIMITS.labelMin).max(LIMITS.labelMax),
      shouldRender: z.boolean().optional(),
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
          channel: z.string().min(1).max(100),
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

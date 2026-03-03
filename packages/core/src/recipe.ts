import { z } from 'zod';
import type { Capability } from './capabilities.js';
import { StorefrontStyleSchema } from './storefront-style.js';

export type ModuleStatus = 'DRAFT' | 'PUBLISHED';

export type ModuleCategory =
  | 'STOREFRONT_UI'
  | 'ADMIN_UI'
  | 'FUNCTION'
  | 'INTEGRATION'
  | 'FLOW'
  | 'CUSTOMER_ACCOUNT';

export type ModuleType =
  | 'theme.banner'
  | 'theme.popup'
  | 'theme.notificationBar'
  | 'proxy.widget'
  | 'functions.discountRules'
  | 'functions.deliveryCustomization'
  | 'functions.paymentCustomization'
  | 'functions.cartAndCheckoutValidation'
  | 'functions.cartTransform'
  | 'checkout.upsell'
  | 'integration.httpSync'
  | 'flow.automation'
  | 'platform.extensionBlueprint'
  | 'customerAccount.blocks';

export type DeployTarget =
  | { kind: 'THEME'; themeId: string }
  | { kind: 'PLATFORM' };

/**
 * RecipeSpec is the only thing the AI is allowed to generate.
 * It is validated, versioned, and compiled to safe deploy operations.
 */
const Base = z.object({
  name: z.string().min(3).max(80),
  category: z.custom<ModuleCategory>(),
  requires: z.array(z.custom<Capability>()).default([]),
});

export const RecipeSpecSchema = z.discriminatedUnion('type', [
  Base.extend({
    type: z.literal('theme.banner'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['THEME_ASSETS']),
    config: z.object({
      heading: z.string().min(1).max(80),
      subheading: z.string().min(0).max(200).optional(),
      ctaText: z.string().min(0).max(40).optional(),
      ctaUrl: z.string().url().optional(),
      imageUrl: z.string().url().optional(),
      enableAnimation: z.boolean().default(false),
    }),
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('theme.popup'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['THEME_ASSETS']),
    config: z.object({
      title: z.string().min(1).max(60),
      body: z.string().min(0).max(240).optional(),
      trigger: z.enum(['ON_LOAD', 'ON_EXIT_INTENT', 'ON_SCROLL_50', 'ON_SCROLL_25', 'ON_SCROLL_75', 'ON_CLICK', 'TIMED']).default('ON_LOAD'),
      delaySeconds: z.number().int().min(0).max(300).default(0),
      frequency: z.enum(['EVERY_VISIT', 'ONCE_PER_SESSION', 'ONCE_PER_DAY', 'ONCE_PER_WEEK', 'ONCE_EVER']).default('ONCE_PER_DAY'),
      maxShowsPerDay: z.number().int().min(0).max(100).default(0),
      showOnPages: z.enum(['ALL', 'HOMEPAGE', 'COLLECTION', 'PRODUCT', 'CART', 'CUSTOM']).default('ALL'),
      customPageUrls: z.array(z.string().max(200)).max(20).default([]),
      autoCloseSeconds: z.number().int().min(0).max(300).default(0),
      showCloseButton: z.boolean().default(true),
      countdownEnabled: z.boolean().default(false),
      countdownSeconds: z.number().int().min(0).max(86400).default(0),
      countdownLabel: z.string().max(40).default(''),
      ctaText: z.string().min(0).max(40).optional(),
      ctaUrl: z.string().url().optional(),
      secondaryCtaText: z.string().max(40).optional(),
      secondaryCtaUrl: z.string().url().optional(),
    }),
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('theme.notificationBar'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['THEME_ASSETS']),
    config: z.object({
      message: z.string().min(1).max(140),
      linkText: z.string().min(0).max(40).optional(),
      linkUrl: z.string().url().optional(),
      dismissible: z.boolean().default(true),
    }),
    style: StorefrontStyleSchema.optional(),
  }),

  Base.extend({
    type: z.literal('proxy.widget'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['APP_PROXY']),
    config: z.object({
      widgetId: z.string().regex(/^[a-z0-9\-]{3,40}$/),
      mode: z.enum(['JSON', 'HTML']).default('HTML'),
      title: z.string().min(1).max(80),
      message: z.string().min(0).max(240).optional(),
    }),
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
      })).min(1).max(50),
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
      })).min(1).max(50),
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
      })).min(1).max(50),
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
      })).min(1).max(50),
    }),
  }),

  Base.extend({
    type: z.literal('functions.cartTransform'),
    category: z.literal('FUNCTION').default('FUNCTION'),
    requires: z.array(z.custom<Capability>()).default(['CART_TRANSFORM_FUNCTION_UPDATE']),
    config: z.object({
      mode: z.enum(['BUNDLE', 'UNBUNDLE']).default('BUNDLE'),
      bundles: z.array(z.object({
        title: z.string().min(1).max(60),
        componentSkus: z.array(z.string()).min(2).max(20),
        bundleSku: z.string().min(1),
      })).min(1).max(50),
      // If the store is not Plus, we can optionally publish a *theme-only* fallback
      // to provide UI guidance (not true cart transforms).
      fallbackTheme: z.object({
        enabled: z.boolean().default(true),
        notificationMessage: z.string().min(1).max(140).default('Bundling requires Shopify Plus.'),
      }).default({ enabled: true, notificationMessage: 'Bundling requires Shopify Plus.' }),
    }),
  }),

  Base.extend({
    type: z.literal('checkout.upsell'),
    category: z.literal('STOREFRONT_UI').default('STOREFRONT_UI'),
    requires: z.array(z.custom<Capability>()).default(['CHECKOUT_UI_INFO_SHIP_PAY']),
    config: z.object({
      offerTitle: z.string().min(1).max(60),
      productVariantGid: z.string().min(10),
      discountPercent: z.number().min(0).max(100).default(0),
    }),
  }),

  Base.extend({
    type: z.literal('integration.httpSync'),
    category: z.literal('INTEGRATION').default('INTEGRATION'),
    config: z.object({
      connectorId: z.string().min(1),
      endpointPath: z.string().regex(/^\/[a-z0-9\-\/]{1,200}$/),
      trigger: z.enum([
        'MANUAL',
        'SHOPIFY_WEBHOOK_ORDER_CREATED',
        'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
        'SHOPIFY_WEBHOOK_CUSTOMER_CREATED',
        'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED',
        'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED',
        'SHOPIFY_WEBHOOK_COLLECTION_CREATED',
        'SCHEDULED',
      ]),
      payloadMapping: z.record(z.string(), z.string()).default({}),
    }),
  }),

  Base.extend({
    type: z.literal('flow.automation'),
    category: z.literal('FLOW').default('FLOW'),
    config: z.object({
      trigger: z.enum([
        'MANUAL',
        'SHOPIFY_WEBHOOK_ORDER_CREATED',
        'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
        'SHOPIFY_WEBHOOK_CUSTOMER_CREATED',
        'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED',
        'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED',
        'SHOPIFY_WEBHOOK_COLLECTION_CREATED',
        'SCHEDULED',
        'SUPERAPP_MODULE_PUBLISHED',
        'SUPERAPP_CONNECTOR_SYNCED',
        'SUPERAPP_DATA_RECORD_CREATED',
        'SUPERAPP_WORKFLOW_COMPLETED',
        'SUPERAPP_WORKFLOW_FAILED',
      ]),
      steps: z.array(z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('HTTP_REQUEST'),
          connectorId: z.string().min(1),
          path: z.string().regex(/^\/[a-z0-9\-\/]{1,200}$/),
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
          bodyMapping: z.record(z.string(), z.string()).default({}),
        }),
        z.object({
          kind: z.literal('SEND_HTTP_REQUEST'),
          url: z.string().url().refine(u => u.startsWith('https://'), { message: 'Only HTTPS URLs allowed' }),
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']).default('POST'),
          headers: z.record(z.string(), z.string()).default({}),
          body: z.string().max(50_000).optional(),
          authType: z.enum(['none', 'basic', 'bearer', 'custom_header']).default('none'),
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
          operator: z.enum(['equal_to', 'not_equal_to', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_set', 'is_not_set']),
          value: z.union([z.string(), z.number(), z.boolean()]).optional(),
          thenSteps: z.array(z.lazy(() => z.any())).optional(),
          elseSteps: z.array(z.lazy(() => z.any())).optional(),
        }),
      ])).min(1).max(40),
    }),
  }),

  Base.extend({
    type: z.literal('platform.extensionBlueprint'),
    category: z.literal('ADMIN_UI').default('ADMIN_UI'),
    config: z.object({
      surface: z.enum(['CHECKOUT_UI', 'THEME_APP_EXTENSION', 'FUNCTION']),
      goal: z.string().min(5).max(240),
      suggestedFiles: z.array(z.string()).min(1).max(50),
    }),
  }),

  Base.extend({
    type: z.literal('customerAccount.blocks'),
    category: z.literal('CUSTOMER_ACCOUNT').default('CUSTOMER_ACCOUNT'),
    requires: z.array(z.custom<Capability>()).default(['CUSTOMER_ACCOUNT_UI']),
    config: z.object({
      target: z.enum([
        'customer-account.order-status.block.render',
        'customer-account.order-index.block.render',
        'customer-account.profile.block.render',
        'customer-account.page.render',
      ]),
      title: z.string().min(1).max(80),
      blocks: z.array(z.object({
        kind: z.enum(['TEXT', 'LINK', 'BADGE', 'DIVIDER']),
        content: z.string().min(0).max(240).optional(),
        url: z.string().url().optional(),
        tone: z.enum(['info', 'success', 'warning', 'critical']).optional(),
      })).min(1).max(20),
      b2bOnly: z.boolean().default(false),
    }),
  }),
]);

export type RecipeSpec = z.infer<typeof RecipeSpecSchema>;

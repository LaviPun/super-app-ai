import { RecipeSpecSchema, type RecipeSpec } from './recipe.js';
import type { ModuleCategory } from './allowed-values.js';
import { MODULE_CATEGORIES } from './allowed-values.js';
import type { Capability } from './capabilities.js';
import { PART1_TEMPLATES } from './_templates_part1.js';
import { PART2_TEMPLATES } from './_templates_part2.js';
import { PART3_TEMPLATES } from './_templates_part3.js';
import { PART4_TEMPLATES } from './_templates_part4.js';

export type TemplateEntry = {
  id: string;
  name: string;
  description: string;
  category: ModuleCategory;
  type: string;
  icon?: string;
  tags?: string[];
  spec: RecipeSpec;
};

export type TemplateStorageMode =
  | 'NONE'
  | 'DATA_CAPTURE'
  | 'DATA_STORE'
  | 'DATA_CAPTURE_AND_DATA_STORE'
  | 'EXTERNAL_SYNC';

export type TemplateReadiness = {
  templateId: string;
  type: string;
  hasAdvancedSettings: boolean;
  dataSaveReady: boolean;
  requiredDataFlags: Capability[];
  missingDataFlags: Capability[];
  storageMode: TemplateStorageMode;
  dbModels: string[];
  checks: {
    id: string;
    ok: boolean;
    detail: string;
  }[];
};

export type TemplateInstallability = {
  ok: boolean;
  reasons: string[];
  readiness: TemplateReadiness;
};

/**
 * Types where a modern template is expected to include a concrete data-save path
 * (DataCapture/DataStore/external sync) rather than only visual output.
 */
export const TEMPLATE_TYPES_REQUIRING_DATA_SAVE: ReadonlySet<string> = new Set([
  'theme.contactForm',
  'flow.automation',
  'integration.httpSync',
  'analytics.pixel',
]);

/** Categories that have templates; from Allowed Values Manifest (doc Section 4 + 9). */
export const TEMPLATE_CATEGORIES = MODULE_CATEGORIES;

const TEMPLATE_SOURCE: TemplateEntry[] = [
  ...PART1_TEMPLATES,
  ...PART2_TEMPLATES,
  ...PART3_TEMPLATES,
  ...PART4_TEMPLATES,
];

function uniqCapabilities(flags: Capability[]): Capability[] {
  return Array.from(new Set(flags));
}

function getRequiredDataFlagsForType(type: string): Capability[] {
  switch (type) {
    case 'theme.banner':
    case 'theme.popup':
    case 'theme.notificationBar':
    case 'theme.floatingWidget':
    case 'theme.effect':
      return ['PRODUCT_DATA', 'COLLECTION_DATA', 'METAFIELD_DATA'];
    case 'theme.contactForm':
      return ['CUSTOMER_DATA', 'PRODUCT_DATA', 'COLLECTION_DATA', 'METAFIELD_DATA'];
    case 'proxy.widget':
      return ['PRODUCT_DATA', 'COLLECTION_DATA', 'CART_DATA', 'CUSTOMER_DATA'];
    case 'functions.discountRules':
    case 'functions.deliveryCustomization':
    case 'functions.paymentCustomization':
    case 'functions.cartAndCheckoutValidation':
    case 'functions.cartTransform':
    case 'functions.fulfillmentConstraints':
    case 'functions.orderRoutingLocationRule':
      return ['FUNCTION_DATA', 'PRODUCT_DATA', 'ORDER_DATA', 'CART_DATA', 'CHECKOUT_DATA', 'METAFIELD_DATA', 'METAOBJECT_DATA'];
    case 'checkout.upsell':
    case 'checkout.block':
      return ['CHECKOUT_DATA', 'CART_DATA', 'PRODUCT_DATA', 'CUSTOMER_DATA', 'ORDER_DATA'];
    case 'postPurchase.offer':
      return ['ORDER_DATA', 'PRODUCT_DATA', 'CUSTOMER_DATA', 'CHECKOUT_DATA'];
    case 'admin.block':
    case 'admin.action':
      return ['PRODUCT_DATA', 'COLLECTION_DATA', 'ORDER_DATA', 'CUSTOMER_DATA', 'METAFIELD_DATA', 'METAOBJECT_DATA'];
    case 'pos.extension':
      return ['ORDER_DATA', 'PRODUCT_DATA', 'CUSTOMER_DATA', 'CART_DATA'];
    case 'analytics.pixel':
      return ['CUSTOMER_DATA', 'PRODUCT_DATA', 'COLLECTION_DATA', 'CART_DATA', 'CHECKOUT_DATA', 'ORDER_DATA'];
    case 'integration.httpSync':
      return ['CUSTOMER_DATA', 'PRODUCT_DATA', 'COLLECTION_DATA', 'ORDER_DATA', 'CART_DATA', 'CHECKOUT_DATA', 'METAFIELD_DATA', 'METAOBJECT_DATA'];
    case 'flow.automation':
      return ['FUNCTION_DATA', 'CUSTOMER_DATA', 'PRODUCT_DATA', 'COLLECTION_DATA', 'ORDER_DATA', 'CART_DATA', 'CHECKOUT_DATA', 'METAFIELD_DATA', 'METAOBJECT_DATA'];
    case 'platform.extensionBlueprint':
      return ['METAFIELD_DATA', 'METAOBJECT_DATA'];
    case 'customerAccount.blocks':
      return ['CUSTOMER_DATA', 'ORDER_DATA', 'METAFIELD_DATA', 'METAOBJECT_DATA'];
    default:
      return [];
  }
}

function withDataSurfaceRequires(spec: RecipeSpec): RecipeSpec {
  const existing = Array.isArray(spec.requires) ? [...spec.requires] as Capability[] : [];
  const requiredFlags = getRequiredDataFlagsForType(spec.type);
  if (requiredFlags.length === 0) return spec;
  return {
    ...spec,
    requires: uniqCapabilities([...existing, ...requiredFlags]),
  };
}

function withFlowDefaults(spec: RecipeSpec): RecipeSpec {
  if (spec.type !== 'flow.automation') return spec;
  return {
    ...spec,
    config: {
      ...spec.config,
      steps: spec.config.steps.map((step) => {
        if (step.kind === 'SEND_HTTP_REQUEST') {
          return {
            ...step,
            method: step.method ?? 'POST',
            authType: step.authType ?? 'none',
            headers: {
              'X-SuperApp-Source': 'template',
              ...step.headers,
            },
          };
        }
        if (step.kind === 'WRITE_TO_STORE') {
          return {
            ...step,
            titleExpr: step.titleExpr ?? '{{order.name}} - {{order.id}}',
            payloadMapping: {
              orderId: '{{order.id}}',
              customerId: '{{customer.id}}',
              event: '{{trigger.event}}',
              ...step.payloadMapping,
            },
          };
        }
        if (step.kind === 'HTTP_REQUEST') {
          return {
            ...step,
            method: step.method ?? 'POST',
            bodyMapping: {
              orderId: '{{order.id}}',
              event: '{{trigger.event}}',
              ...step.bodyMapping,
            },
          };
        }
        return step;
      }),
    },
  };
}

function withTypeDefaults(spec: RecipeSpec): RecipeSpec {
  if (spec.type === 'theme.popup') {
    return {
      ...spec,
      config: {
        ...spec.config,
        trigger: spec.config.trigger ?? 'ON_EXIT_INTENT',
        delaySeconds: spec.config.delaySeconds ?? 3,
        frequency: spec.config.frequency ?? 'ONCE_PER_DAY',
        maxShowsPerDay: spec.config.maxShowsPerDay ?? 2,
        showOnPages: spec.config.showOnPages ?? 'ALL',
        customPageUrls: spec.config.customPageUrls ?? [],
        autoCloseSeconds: spec.config.autoCloseSeconds ?? 0,
        showCloseButton: spec.config.showCloseButton ?? true,
        countdownEnabled: spec.config.countdownEnabled ?? false,
        countdownSeconds: spec.config.countdownSeconds ?? 0,
        countdownLabel: spec.config.countdownLabel ?? '',
        secondaryCtaText: spec.config.secondaryCtaText ?? 'No thanks',
      },
    };
  }

  if (spec.type === 'theme.banner') {
    return {
      ...spec,
      config: {
        ...spec.config,
        ctaText: spec.config.ctaText ?? 'Learn more',
        enableAnimation: spec.config.enableAnimation ?? false,
      },
    };
  }

  if (spec.type === 'theme.notificationBar') {
    return {
      ...spec,
      config: {
        ...spec.config,
        dismissible: spec.config.dismissible ?? true,
        linkText: spec.config.linkText ?? 'Learn more',
      },
    };
  }

  if (spec.type === 'theme.contactForm') {
    return {
      ...spec,
      config: {
        ...spec.config,
        submitLabel: spec.config.submitLabel ?? 'Send message',
        successMessage: spec.config.successMessage ?? 'Thanks! We received your message.',
        errorMessage: spec.config.errorMessage ?? 'Something went wrong. Please try again.',
        showName: spec.config.showName ?? true,
        showEmail: spec.config.showEmail ?? true,
        showMessage: spec.config.showMessage ?? true,
        nameRequired: spec.config.nameRequired ?? true,
        emailRequired: spec.config.emailRequired ?? true,
        messageRequired: spec.config.messageRequired ?? true,
        consentRequired: spec.config.consentRequired ?? false,
        submissionMode: spec.config.submissionMode ?? 'SHOPIFY_CONTACT',
        proxyEndpointPath: spec.config.proxyEndpointPath ?? '/apps/superapp/capture',
        includeCustomerContext: spec.config.includeCustomerContext ?? true,
        spamProtection: spec.config.spamProtection ?? 'HONEYPOT',
        honeypotFieldName: spec.config.honeypotFieldName ?? 'website',
        tags: spec.config.tags ?? [],
      },
    };
  }

  if (spec.type === 'theme.floatingWidget') {
    return {
      ...spec,
      config: {
        ...spec.config,
        variant: spec.config.variant ?? 'custom',
        anchor: spec.config.anchor ?? 'bottom_right',
        offsetX: spec.config.offsetX ?? 24,
        offsetY: spec.config.offsetY ?? 24,
        onClick: spec.config.onClick ?? 'open_url',
        hideOnDesktop: spec.config.hideOnDesktop ?? false,
        hideOnMobile: spec.config.hideOnMobile ?? false,
      },
    };
  }

  if (spec.type === 'integration.httpSync') {
    return {
      ...spec,
      config: {
        ...spec.config,
        payloadMapping: {
          shop: '{{shop.id}}',
          event: '{{trigger.event}}',
          createdAt: '{{now.iso}}',
          ...spec.config.payloadMapping,
        },
      },
    };
  }

  if (spec.type === 'analytics.pixel') {
    return {
      ...spec,
      config: {
        ...spec.config,
        mapping: {
          moduleId: '{{module.id}}',
          shopId: '{{shop.id}}',
          ...spec.config.mapping,
        },
      },
    };
  }

  if (spec.type === 'functions.discountRules') {
    return {
      ...spec,
      config: {
        ...spec.config,
        combineWithOtherDiscounts: spec.config.combineWithOtherDiscounts ?? true,
      },
    };
  }

  if (spec.type === 'functions.deliveryCustomization') {
    return {
      ...spec,
      config: {
        ...spec.config,
        rules: spec.config.rules.map((rule) => ({
          ...rule,
          actions: {
            ...rule.actions,
            reorderPriority: rule.actions.reorderPriority ?? 50,
          },
        })),
      },
    };
  }

  if (spec.type === 'functions.paymentCustomization') {
    return {
      ...spec,
      config: {
        ...spec.config,
        rules: spec.config.rules.map((rule) => ({
          ...rule,
          actions: {
            ...rule.actions,
            reorderPriority: rule.actions.reorderPriority ?? 50,
          },
        })),
      },
    };
  }

  if (spec.type === 'functions.cartTransform') {
    return {
      ...spec,
      config: {
        ...spec.config,
        fallbackTheme: {
          enabled: spec.config.fallbackTheme?.enabled ?? true,
          notificationMessage:
            spec.config.fallbackTheme?.notificationMessage ?? 'Bundling requires Shopify Plus.',
        },
      },
    };
  }

  return spec;
}

function modernizeTemplateEntry(template: TemplateEntry): TemplateEntry {
  const typed = template.spec;
  const withDefaults = withDataSurfaceRequires(withTypeDefaults(withFlowDefaults(typed)));
  return {
    ...template,
    spec: withDefaults,
  };
}

export const MODULE_TEMPLATES: TemplateEntry[] = TEMPLATE_SOURCE.map(modernizeTemplateEntry);

export function findTemplate(templateId: string): TemplateEntry | undefined {
  return MODULE_TEMPLATES.find(t => t.id === templateId);
}

export function getTemplatesByCategory(category?: string): TemplateEntry[] {
  if (!category) return MODULE_TEMPLATES;
  return MODULE_TEMPLATES.filter(t => t.category === category);
}

export function getTemplateReadiness(template: TemplateEntry): TemplateReadiness {
  const cfg = template.spec.config as Record<string, unknown>;
  const specMeta = template.spec as Record<string, unknown>;
  const checks: TemplateReadiness['checks'] = [];

  const hasStyle = specMeta.style != null;
  const hasPlacement = specMeta.placement != null;
  checks.push({
    id: 'base.layout',
    ok: hasStyle && hasPlacement,
    detail: hasStyle && hasPlacement ? 'Has style + placement metadata' : 'Missing style or placement metadata',
  });

  const advancedValidation = RecipeSpecSchema.safeParse(template.spec);
  const typeSpecificAdvanced = advancedValidation.success;

  checks.push({
    id: 'advanced.settings',
    ok: typeSpecificAdvanced,
    detail: typeSpecificAdvanced ? 'Includes type-specific advanced settings' : 'Missing some advanced settings for this type',
  });

  const hasWriteToStore = template.type === 'flow.automation'
    && Array.isArray(cfg.steps)
    && (cfg.steps as Array<{ kind?: string }>).some((s) => s.kind === 'WRITE_TO_STORE');
  const hasContactCapture = template.type === 'theme.contactForm'
    && (cfg.submissionMode === 'APP_PROXY' || cfg.submissionMode === 'SHOPIFY_CONTACT');
  const hasAnalyticsCapture = template.type === 'analytics.pixel';
  const hasExternalSync = template.type === 'integration.httpSync';

  let storageMode: TemplateStorageMode = 'NONE';
  if (hasWriteToStore && (hasContactCapture || hasAnalyticsCapture)) storageMode = 'DATA_CAPTURE_AND_DATA_STORE';
  else if (hasWriteToStore) storageMode = 'DATA_STORE';
  else if (hasContactCapture || hasAnalyticsCapture) storageMode = 'DATA_CAPTURE';
  else if (hasExternalSync) storageMode = 'EXTERNAL_SYNC';

  const dataSaveRequired = TEMPLATE_TYPES_REQUIRING_DATA_SAVE.has(template.type);
  const dataSaveReady = dataSaveRequired ? storageMode !== 'NONE' : true;
  checks.push({
    id: 'data.persistence',
    ok: dataSaveReady,
    detail: dataSaveReady
      ? (dataSaveRequired ? `Data persistence mode: ${storageMode}` : 'Persistence not required for this template type')
      : 'No direct data persistence path in this template',
  });

  const requiredDataFlags = getRequiredDataFlagsForType(template.type);
  const presentFlags = new Set((template.spec.requires ?? []) as Capability[]);
  const missingDataFlags = requiredDataFlags.filter((flag) => !presentFlags.has(flag));
  checks.push({
    id: 'data.flags',
    ok: missingDataFlags.length === 0,
    detail: missingDataFlags.length === 0
      ? 'All required Shopify data-surface flags are declared'
      : `Missing required data flags: ${missingDataFlags.join(', ')}`,
  });

  const dbModels: string[] = [];
  if (storageMode === 'DATA_CAPTURE' || storageMode === 'DATA_CAPTURE_AND_DATA_STORE') dbModels.push('DataCapture');
  if (storageMode === 'DATA_STORE' || storageMode === 'DATA_CAPTURE_AND_DATA_STORE') dbModels.push('DataStore', 'DataStoreRecord');
  if (storageMode === 'EXTERNAL_SYNC') dbModels.push('Connector', 'ConnectorEndpoint');

  return {
    templateId: template.id,
    type: template.type,
    hasAdvancedSettings: typeSpecificAdvanced,
    dataSaveReady,
    requiredDataFlags,
    missingDataFlags,
    storageMode,
    dbModels,
    checks,
  };
}

export function getTemplateInstallability(template: TemplateEntry): TemplateInstallability {
  const readiness = getTemplateReadiness(template);
  const reasons: string[] = [];

  if (!readiness.hasAdvancedSettings) {
    reasons.push('Template is missing required advanced settings for its module type.');
  }

  if (TEMPLATE_TYPES_REQUIRING_DATA_SAVE.has(template.type) && !readiness.dataSaveReady) {
    reasons.push('Template must provide a data-save path (DataCapture, DataStore, or external sync).');
  }

  if (readiness.missingDataFlags.length > 0) {
    reasons.push(`Template must declare required Shopify data flags: ${readiness.missingDataFlags.join(', ')}.`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    readiness,
  };
}

import type { RecipeSpec } from './recipe.js';
import type { ModuleCategory } from './allowed-values.js';
import { MODULE_CATEGORIES } from './allowed-values.js';
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
  const withDefaults = withTypeDefaults(withFlowDefaults(typed));
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

function hasKeys(value: unknown, requiredKeys: string[]): boolean {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return requiredKeys.every((k) => obj[k] !== undefined);
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

  const typeSpecificAdvanced =
    (template.type === 'theme.popup' && hasKeys(cfg, ['trigger', 'frequency', 'maxShowsPerDay', 'showOnPages'])) ||
    (template.type === 'theme.contactForm' && hasKeys(cfg, ['submissionMode', 'spamProtection', 'showName', 'showEmail', 'showMessage'])) ||
    (template.type === 'theme.banner' && hasKeys(cfg, ['heading', 'subheading', 'ctaText'])) ||
    (template.type === 'theme.notificationBar' && hasKeys(cfg, ['message', 'linkText', 'dismissible'])) ||
    (template.type === 'theme.floatingWidget' && hasKeys(cfg, ['variant', 'onClick', 'anchor'])) ||
    (template.type === 'integration.httpSync' && hasKeys(cfg, ['connectorId', 'endpointPath', 'payloadMapping'])) ||
    (template.type === 'flow.automation' && Array.isArray(cfg.steps) && cfg.steps.length > 0) ||
    (template.type === 'functions.discountRules' && Array.isArray((cfg.rules as unknown[] | undefined) ?? []) && (cfg.rules as unknown[]).length > 0) ||
    (template.type === 'functions.deliveryCustomization' && Array.isArray((cfg.rules as unknown[] | undefined) ?? []) && (cfg.rules as unknown[]).length > 0) ||
    (template.type === 'functions.paymentCustomization' && Array.isArray((cfg.rules as unknown[] | undefined) ?? []) && (cfg.rules as unknown[]).length > 0) ||
    (template.type === 'functions.cartAndCheckoutValidation' && hasKeys(cfg, ['errorMessage'])) ||
    (template.type === 'functions.cartTransform' && hasKeys(cfg, ['mode', 'bundles'])) ||
    (template.type === 'functions.fulfillmentConstraints' && Array.isArray((cfg.rules as unknown[] | undefined) ?? [])) ||
    (template.type === 'functions.orderRoutingLocationRule' && Array.isArray((cfg.rules as unknown[] | undefined) ?? [])) ||
    (template.type === 'checkout.block' && hasKeys(cfg, ['target', 'title', 'message'])) ||
    (template.type === 'checkout.upsell' && hasKeys(cfg, ['offerTitle', 'productVariantGid'])) ||
    (template.type === 'postPurchase.offer' && hasKeys(cfg, ['offerTitle', 'message'])) ||
    (template.type === 'analytics.pixel' && hasKeys(cfg, ['events', 'mapping'])) ||
    (template.type === 'customerAccount.blocks' && hasKeys(cfg, ['target', 'blocks'])) ||
    (template.type === 'admin.block' && hasKeys(cfg, ['target', 'title'])) ||
    (template.type === 'admin.action' && hasKeys(cfg, ['target', 'label'])) ||
    (template.type === 'pos.extension' && hasKeys(cfg, ['target', 'blockKind'])) ||
    (template.type === 'platform.extensionBlueprint' && hasKeys(cfg, ['surface', 'goal', 'suggestedFiles'])) ||
    (template.type === 'proxy.widget' && hasKeys(cfg, ['widgetId', 'mode']));

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

  const dataSaveReady = storageMode !== 'NONE';
  checks.push({
    id: 'data.persistence',
    ok: dataSaveReady,
    detail: dataSaveReady ? `Data persistence mode: ${storageMode}` : 'No direct data persistence path in this template',
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

  return {
    ok: reasons.length === 0,
    reasons,
    readiness,
  };
}

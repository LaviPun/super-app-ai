import { RecipeSpecSchema, type RecipeSpec } from './recipe.js';
import type { ModuleCategory } from './allowed-values.js';
import { MODULE_CATEGORIES } from './allowed-values.js';
import type { Capability } from './capabilities.js';
import { ALL_TEMPLATES } from './templates/index.js';

/**
 * Quality tier of a template, used by retrieval to grade candidates (Phase 6).
 *  - `exemplar` — a hand-picked, best-in-class entry for its type; retrieval boosts
 *    it so it is preferred as the grounding/few-shot pick when it matches.
 *  - `standard` — a solid, real-workflow template (the default authoring quality).
 *  - `floor`    — a minimal, hand-authored stub that exists only to guarantee ≥1
 *    template per RecipeSpec type (see `templates/coverage.ts`). Retrieval penalizes
 *    floors so they never become the exemplar/grounding pick when anything better
 *    matches, and they can never qualify as a Tier-1 (delta-editable) exemplar.
 *
 * Optional: an untagged template is treated as neutral (`standard`-equivalent) — it
 * receives neither the exemplar boost nor the floor penalty.
 */
export type TemplateTier = 'exemplar' | 'standard' | 'floor';

export type TemplateEntry = {
  id: string;
  name: string;
  description: string;
  category: ModuleCategory;
  type: string;
  icon?: string;
  tags?: string[];
  tier?: TemplateTier;
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
  'flow.automation',
  'integration.httpSync',
  'analytics.pixel',
]);

/** Categories that have templates; from Allowed Values Manifest (doc Section 4 + 9). */
export const TEMPLATE_CATEGORIES = MODULE_CATEGORIES;

const TEMPLATE_SOURCE: TemplateEntry[] = ALL_TEMPLATES;

function uniqCapabilities(flags: Capability[]): Capability[] {
  return Array.from(new Set(flags));
}

/**
 * The storefront-surface "layout types". These are the ONLY two types in the whole
 * template library whose base config is a positioned + skinned visual surface, i.e.
 * they carry `style` (StorefrontStyleSchema) and `placement` (recipe.ts:397-398 for
 * `theme.section`, 430-431 for `proxy.widget`). Every other type renders from its
 * `config` object and never uses theme style/placement, so `base.layout` must not
 * demand those fields of them.
 */
const STOREFRONT_LAYOUT_TYPES: ReadonlySet<string> = new Set([
  'theme.section',
  'proxy.widget',
]);

/** Flow step kinds that are pure control flow (no durable effect of their own). */
const FLOW_CONTROL_STEP_KINDS: ReadonlySet<string> = new Set(['DELAY', 'CONDITION']);

type FlowStep = { kind?: string; thenSteps?: unknown; elseSteps?: unknown };

/**
 * Collect every flow step kind, recursing through `CONDITION` then/else branches.
 * A persistence or effect step nested inside a condition (e.g. FLOW-04's
 * WRITE_TO_STORE in `thenSteps`) must count — a top-level-only scan under-reports it.
 */
function collectFlowStepKinds(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  const out: string[] = [];
  for (const raw of steps) {
    const step = raw as FlowStep;
    if (typeof step.kind === 'string') out.push(step.kind);
    out.push(...collectFlowStepKinds(step.thenSteps));
    out.push(...collectFlowStepKinds(step.elseSteps));
  }
  return out;
}

function getRequiredDataFlagsForType(type: string): Capability[] {
  switch (type) {
    case 'theme.section':
      return ['PRODUCT_DATA', 'COLLECTION_DATA', 'METAFIELD_DATA'];
    case 'proxy.widget':
      return ['PRODUCT_DATA', 'COLLECTION_DATA', 'CART_DATA', 'CUSTOMER_DATA'];
    case 'functions.discountRules':
    case 'functions.deliveryCustomization':
    case 'functions.paymentCustomization':
    case 'functions.cartAndCheckoutValidation':
    case 'functions.cartTransform':
    case 'functions.fulfillmentConstraints':
    case 'functions.orderRoutingLocationRule':
    case 'functions.shippingDiscount':
    case 'functions.localPickupDeliveryOption':
    case 'functions.pickupPointDeliveryOption':
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


  if (spec.type === 'theme.section' && spec.config.kind === 'contactForm') {
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

  if (spec.type === 'theme.section' && spec.config.kind === 'floatingWidget') {
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

  const advancedValidation = RecipeSpecSchema.safeParse(template.spec);
  const typeSpecificAdvanced = advancedValidation.success;

  // ── base.layout ──────────────────────────────────────────────────────────────
  // Does the template carry the BASE metadata its own type actually renders from?
  //
  // Only the storefront-surface layout types (STOREFRONT_LAYOUT_TYPES = theme.section
  // + proxy.widget) render visible markup positioned by `placement` and skinned by
  // `style`, so for them style+placement IS the base layout. Every other type
  // (pos.extension, admin.*, functions.*, flow.automation, messaging.campaign,
  // checkout.*, integration.httpSync, customerAccount.blocks, …) renders from its
  // `config` object and never uses theme style/placement — the previous check
  // demanded those fields of ALL types and so failed ~290 schema-complete templates
  // on metadata that does not apply to them. This makes the check type-aware without
  // hiding real gaps: a genuinely-empty template still fails (empty config / invalid
  // schema / missing placement).
  //
  // Sub-case: a `theme.section` with `activation: 'head'` is a head app-embed that
  // injects into the document <head> and renders NO visible markup (recipe.ts:345-351,
  // `style` is .optional()). It legitimately has no visual `style`; it is base-complete
  // with `placement` alone (which gates the templates it injects on). Requiring a
  // `style` block here would fabricate visual metadata for an invisible module.
  const hasStyle = specMeta.style != null;
  const hasPlacement = specMeta.placement != null;
  const isStorefrontLayout = STOREFRONT_LAYOUT_TYPES.has(template.type);
  const isHeadEmbed = template.type === 'theme.section' && cfg.activation === 'head';
  const hasBaseConfig = cfg != null && typeof cfg === 'object' && Object.keys(cfg).length > 0;

  let baseLayoutOk: boolean;
  let baseLayoutDetail: string;
  if (isHeadEmbed) {
    baseLayoutOk = hasPlacement;
    baseLayoutDetail = hasPlacement
      ? 'Head app-embed: placement present (injects into <head>, no visual style by design)'
      : 'Head app-embed is missing placement metadata';
  } else if (isStorefrontLayout) {
    baseLayoutOk = hasStyle && hasPlacement;
    baseLayoutDetail = baseLayoutOk
      ? 'Storefront surface: style + placement metadata present'
      : 'Missing style or placement metadata for this storefront surface';
  } else {
    baseLayoutOk = hasBaseConfig && typeSpecificAdvanced;
    baseLayoutDetail = baseLayoutOk
      ? 'Base configuration present for this type'
      : 'Missing or invalid base configuration for this type';
  }
  checks.push({ id: 'base.layout', ok: baseLayoutOk, detail: baseLayoutDetail });

  checks.push({
    id: 'advanced.settings',
    ok: typeSpecificAdvanced,
    detail: typeSpecificAdvanced ? 'Includes type-specific advanced settings' : 'Missing some advanced settings for this type',
  });

  // Flow persistence detection recurses through CONDITION branches (FLOW-04 nests
  // its WRITE_TO_STORE inside `thenSteps`), and distinguishes concrete effect steps
  // (tag/note/notify/sync/write) from pure control flow (DELAY/CONDITION).
  const flowStepKinds = template.type === 'flow.automation'
    ? collectFlowStepKinds(cfg.steps)
    : [];
  const hasWriteToStore = flowStepKinds.includes('WRITE_TO_STORE');
  const flowHasEffect = flowStepKinds.some((k) => !FLOW_CONTROL_STEP_KINDS.has(k));
  const hasContactCapture = template.type === 'theme.section'
    && cfg.kind === 'contactForm'
    && (cfg.submissionMode === 'APP_PROXY' || cfg.submissionMode === 'SHOPIFY_CONTACT');
  const hasAnalyticsCapture = template.type === 'analytics.pixel';
  const hasExternalSync = template.type === 'integration.httpSync';

  let storageMode: TemplateStorageMode = 'NONE';
  if (hasWriteToStore && (hasContactCapture || hasAnalyticsCapture)) storageMode = 'DATA_CAPTURE_AND_DATA_STORE';
  else if (hasWriteToStore) storageMode = 'DATA_STORE';
  else if (hasContactCapture || hasAnalyticsCapture) storageMode = 'DATA_CAPTURE';
  else if (hasExternalSync) storageMode = 'EXTERNAL_SYNC';

  // ── data.persistence ─────────────────────────────────────────────────────────
  // Types in TEMPLATE_TYPES_REQUIRING_DATA_SAVE must do something durable, not just
  // render output. For integration.httpSync / analytics.pixel that means a concrete
  // capture/sync path (storageMode !== 'NONE'). flow.automation is DIFFERENT: a flow
  // does NOT universally need APP-side persistence — many complete, honest flows just
  // tag / annotate / notify / sync (FLOW-02/03/05/06 tag+note+email+Slack) with no
  // DataStore, and that is their real, finished behavior. So a flow is ready when it
  // either persists (WRITE_TO_STORE, incl. nested via collectFlowStepKinds) OR performs
  // any concrete effect step. Only a no-op flow (DELAY/CONDITION with no effect) fails
  // — that IS a genuine gap, not suppressed.
  const dataSaveRequired = TEMPLATE_TYPES_REQUIRING_DATA_SAVE.has(template.type);
  let dataSaveReady: boolean;
  let dataDetail: string;
  if (!dataSaveRequired) {
    dataSaveReady = true;
    dataDetail = 'Persistence not required for this template type';
  } else if (template.type === 'flow.automation') {
    dataSaveReady = storageMode !== 'NONE' || flowHasEffect;
    dataDetail = storageMode !== 'NONE'
      ? `Data persistence mode: ${storageMode}`
      : (flowHasEffect
        ? 'Flow performs store mutations / notifications (no app-side persistence required)'
        : 'Flow has no effect steps — nothing is persisted or acted on');
  } else {
    dataSaveReady = storageMode !== 'NONE';
    dataDetail = dataSaveReady
      ? `Data persistence mode: ${storageMode}`
      : 'No direct data persistence path in this template';
  }
  checks.push({
    id: 'data.persistence',
    ok: dataSaveReady,
    detail: dataDetail,
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

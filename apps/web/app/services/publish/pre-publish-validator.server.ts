/**
 * Pre-publish validator (doc Section 27.2).
 * Runs before Publish; blocks publish and returns clear errors if any check fails.
 * Uses Allowed Values Manifest for target and plan checks.
 */

import type { RecipeSpec } from '@superapp/core';
import {
  CHECKOUT_UI_TARGETS,
  CHECKOUT_UI_PLUS_ONLY_TARGET_PREFIXES,
  THEME_PLACEABLE_TEMPLATES,
  LIMITS,
} from '@superapp/core';
import { isCapabilityAllowed } from '@superapp/core';
import type { PlanTier } from '@superapp/core';

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface PrePublishValidatorContext {
  planTier: PlanTier;
  themeIsOs20?: boolean;
  themeTemplatesSupportAppBlock?: boolean;
  compiledBundleSizeBytes?: number;
}

/**
 * Validates RecipeSpec and context before publish. Returns empty array if valid.
 */
export function validateBeforePublish(
  spec: RecipeSpec,
  ctx: PrePublishValidatorContext,
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (spec.type) {
    case 'theme.banner':
    case 'theme.popup':
    case 'theme.notificationBar':
    case 'theme.contactForm':
    case 'theme.effect':
    case 'proxy.widget':
      errors.push(...validateThemeModule(spec, ctx));
      break;
    case 'checkout.upsell':
    case 'checkout.block':
    case 'postPurchase.offer':
    case 'customerAccount.blocks':
      errors.push(...validateCheckoutOrAccountsModule(spec, ctx));
      break;
    default:
      break;
  }

  return errors;
}

function validateThemeModule(
  spec: RecipeSpec,
  ctx: PrePublishValidatorContext,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (ctx.themeIsOs20 === false) {
    errors.push({
      code: 'THEME_NOT_OS20',
      message:
        "Cannot place here — theme doesn't support app blocks in this area. This module requires an Online Store 2.0 theme.",
    });
  }

  const specAny = spec as { type: string; placement?: { enabled_on?: { templates?: string[]; groups?: string[] }; disabled_on?: { templates?: string[]; groups?: string[] } } };
  if (spec.type !== 'proxy.widget' && specAny.placement) {
    const placement = specAny.placement;
    const templates = placement.enabled_on?.templates ?? placement.disabled_on?.templates ?? [];
    const allowed = new Set(THEME_PLACEABLE_TEMPLATES);
    for (const t of templates) {
      if (!allowed.has(t as (typeof THEME_PLACEABLE_TEMPLATES)[number])) {
        errors.push({
          code: 'INVALID_PLACEMENT_TEMPLATE',
          message: `Template "${t}" is not in the allowed placement list (doc 4.2.2B). Use only: ${THEME_PLACEABLE_TEMPLATES.join(', ')}.`,
          field: 'placement',
        });
      }
    }
  }

  if (
    spec.type === 'theme.banner' ||
    spec.type === 'theme.popup' ||
    spec.type === 'theme.notificationBar' ||
    spec.type === 'theme.contactForm' ||
    spec.type === 'theme.effect' ||
    spec.type === 'proxy.widget'
  ) {
    const s = (spec as { style?: { customCss?: string } }).style;
    if (s?.customCss && s.customCss.length > LIMITS.customCssMax) {
      errors.push({
        code: 'CUSTOM_CSS_OVER_LIMIT',
        message: `Custom CSS must be under ${LIMITS.customCssMax} characters.`,
        field: 'style.customCss',
      });
    }
  }

  return errors;
}

function validateCheckoutOrAccountsModule(
  spec: RecipeSpec,
  ctx: PrePublishValidatorContext,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (spec.type === 'checkout.upsell' || spec.type === 'checkout.block' || spec.type === 'postPurchase.offer') {
    const allowed = new Set(CHECKOUT_UI_TARGETS);
    let target: string | undefined;
    if (spec.type === 'checkout.block' && 'config' in spec && spec.config && 'target' in spec.config) {
      target = spec.config.target as string;
    }
    if (target && !allowed.has(target as (typeof CHECKOUT_UI_TARGETS)[number])) {
      errors.push({
        code: 'INVALID_CHECKOUT_TARGET',
        message: `Target "${target}" is not in the Checkout UI target manifest (doc 4.3.1).`,
        field: 'config.target',
      });
    }

    if (target && CHECKOUT_UI_PLUS_ONLY_TARGET_PREFIXES.some((p) => target!.startsWith(p))) {
      const allowedPlan = isCapabilityAllowed(ctx.planTier, 'CHECKOUT_UI_INFO_SHIP_PAY');
      if (!allowedPlan) {
        errors.push({
          code: 'PLUS_REQUIRED',
          message: 'This checkout target requires Shopify Plus. Upgrade your plan or choose a different target.',
          field: 'config.target',
        });
      }
    }

    if (ctx.compiledBundleSizeBytes != null && ctx.compiledBundleSizeBytes > LIMITS.checkoutUiBundleMaxBytes) {
      errors.push({
        code: 'BUNDLE_SIZE_EXCEEDED',
        message: `Checkout UI extension bundle must be ≤ ${LIMITS.checkoutUiBundleMaxBytes / 1024} KB. Current: ${Math.ceil(ctx.compiledBundleSizeBytes / 1024)} KB.`,
      });
    }
  }

  return errors;
}

/**
 * Validates that a JSON string is strict JSON (no trailing commas, no comments).
 * Use for theme extension schema files (doc 27.2).
 */
export function validateStrictJson(jsonString: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (/,\s*[}\]']/.test(jsonString) || /\/\*[\s\S]*?\*\/|\/\/[^\n]*/m.test(jsonString)) {
    errors.push({
      code: 'INVALID_JSON',
      message: 'Theme extension JSON must be strict: no trailing commas, no comments (doc 27.2).',
    });
  }
  try {
    JSON.parse(jsonString);
  } catch {
    errors.push({ code: 'INVALID_JSON', message: 'Invalid JSON syntax.' });
  }
  return errors;
}

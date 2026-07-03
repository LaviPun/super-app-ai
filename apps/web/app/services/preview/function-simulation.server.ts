/**
 * Deterministic Function preview simulation (WS4 / specs/025-live-preview-all-surfaces).
 *
 * Feeds a representative cart/checkout fixture through a compiled Function rule
 * config and returns concrete outcomes ("Cart $120, VIP → 15% off"; "method
 * 'Economy' hidden") including the non-Plus fallback. Pure + deterministic, so
 * the preview shows exactly what the deployed function would do for the fixture.
 */
import type { RecipeSpec } from '@superapp/core';
import {
  PreviewSimulationResultSchema,
  defaultSimulationInput,
  type PreviewKind,
  type PreviewSimulationInput,
  type PreviewSimulationOutcome,
  type PreviewSimulationResult,
} from '@superapp/platform-contracts';

type FnSpec = Extract<RecipeSpec, { type: `functions.${string}` }>;

export const FUNCTION_PREVIEW_KINDS = new Set<string>([
  'functions.discountRules',
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.cartAndCheckoutValidation',
  'functions.cartTransform',
  'functions.fulfillmentConstraints',
  'functions.orderRoutingLocationRule',
  'functions.shippingDiscount',
]);

export function isFunctionPreviewKind(type: string): boolean {
  return FUNCTION_PREVIEW_KINDS.has(type);
}

function cartSubtotal(input: PreviewSimulationInput): number {
  return input.lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0);
}

function money(n: number, currency: string): string {
  return `${currency} ${n.toFixed(2)}`;
}

/** Simulate a compiled Function spec against a fixture. */
export function simulateFunction(
  spec: FnSpec,
  input: PreviewSimulationInput = defaultSimulationInput(),
): PreviewSimulationResult {
  const kind = spec.type as PreviewKind;
  const subtotal = cartSubtotal(input);
  const currency = input.currency;
  const outcomes: PreviewSimulationOutcome[] = [];
  let fallbackNote: string | undefined;
  const config = spec.config as Record<string, unknown>;
  const rules = Array.isArray(config.rules) ? (config.rules as Array<Record<string, any>>) : [];

  switch (spec.type) {
    case 'functions.discountRules': {
      for (const rule of rules) {
        const when = rule.when ?? {};
        const tagOk = !when.customerTags?.length || when.customerTags.some((t: string) => input.customerTags.includes(t));
        const subtotalOk = when.minSubtotal === undefined || subtotal >= when.minSubtotal;
        if (tagOk && subtotalOk) {
          const pct = rule.apply?.percentageOff;
          const fixed = rule.apply?.fixedAmountOff;
          if (pct) {
            outcomes.push({
              label: `Cart ${money(subtotal, currency)}${when.customerTags?.length ? `, ${when.customerTags.join('/')}` : ''} → ${pct}% off`,
              detail: `Discount ${money((subtotal * pct) / 100, currency)} applied.`,
              effect: 'applied',
            });
          } else if (fixed) {
            outcomes.push({
              label: `Cart ${money(subtotal, currency)} → ${money(fixed, currency)} off`,
              detail: `Fixed discount ${money(fixed, currency)} applied.`,
              effect: 'applied',
            });
          }
        }
      }
      break;
    }
    case 'functions.deliveryCustomization': {
      for (const rule of rules) {
        const when = rule.when ?? {};
        const countryOk = !when.countryCodeIn?.length || when.countryCodeIn.includes(input.countryCode);
        const subtotalOk = when.minSubtotal === undefined || subtotal >= when.minSubtotal;
        if (!countryOk || !subtotalOk) continue;
        for (const m of rule.actions?.hideMethodsContaining ?? []) {
          const hit = input.methods.find((name) => name.toLowerCase().includes(String(m).toLowerCase()));
          if (hit) outcomes.push({ label: `Method '${hit}' hidden`, detail: `Hidden when country=${input.countryCode}, cart=${money(subtotal, currency)}.`, effect: 'hidden' });
        }
        if (rule.actions?.renameMethod) {
          const { contains, to } = rule.actions.renameMethod;
          const hit = input.methods.find((name) => name.toLowerCase().includes(String(contains).toLowerCase()));
          if (hit) outcomes.push({ label: `Method '${hit}' renamed → '${to}'`, detail: 'Rename action applied.', effect: 'renamed' });
        }
        if (rule.actions?.reorderPriority !== undefined) {
          outcomes.push({ label: `Methods reordered (priority ${rule.actions.reorderPriority})`, detail: 'Reorder action applied.', effect: 'reordered' });
        }
      }
      break;
    }
    case 'functions.paymentCustomization': {
      for (const rule of rules) {
        const when = rule.when ?? {};
        const subtotalOk = when.minSubtotal === undefined || subtotal >= when.minSubtotal;
        const currencyOk = !when.currencyIn?.length || when.currencyIn.includes(currency);
        if (!subtotalOk || !currencyOk) continue;
        for (const m of rule.actions?.hideMethodsContaining ?? []) {
          const hit = input.methods.find((name) => name.toLowerCase().includes(String(m).toLowerCase()));
          if (hit) outcomes.push({ label: `Payment method '${hit}' hidden`, detail: `Hidden when cart=${money(subtotal, currency)}.`, effect: 'hidden' });
        }
        if (rule.actions?.renameMethod) {
          const { contains, to } = rule.actions.renameMethod;
          outcomes.push({ label: `Payment method containing '${contains}' renamed → '${to}'`, detail: 'Rename action applied.', effect: 'renamed' });
        }
        if (rule.actions?.requireReview) {
          outcomes.push({ label: 'Order flagged for manual review', detail: 'requireReview action applied.', effect: 'constrained' });
        }
      }
      break;
    }
    case 'functions.cartAndCheckoutValidation': {
      for (const rule of rules) {
        const when = rule.when ?? {};
        if (when.maxQuantityPerSku !== undefined) {
          const over = input.lineItems.find((li) => li.quantity > when.maxQuantityPerSku);
          if (over) outcomes.push({ label: `Checkout blocked: '${over.title}' qty ${over.quantity} > ${when.maxQuantityPerSku}`, detail: rule.errorMessage, effect: 'blocked' });
        }
        if (when.blockCountryCodes?.length && when.blockCountryCodes.includes(input.countryCode)) {
          outcomes.push({ label: `Checkout blocked for country ${input.countryCode}`, detail: rule.errorMessage, effect: 'blocked' });
        }
      }
      break;
    }
    case 'functions.cartTransform': {
      const bundles = Array.isArray(config.bundles) ? (config.bundles as Array<Record<string, any>>) : [];
      if (!input.isPlus) {
        const fb = config.fallbackTheme as { enabled?: boolean; notificationMessage?: string } | undefined;
        fallbackNote = fb?.notificationMessage ?? 'Cart transforms require Shopify Plus; theme fallback shown instead.';
        outcomes.push({ label: 'Non-Plus store: theme fallback', detail: fallbackNote, effect: 'none' });
        break;
      }
      for (const b of bundles) {
        const components: string[] = b.componentSkus ?? [];
        const present = components.filter((sku) => input.lineItems.some((li) => li.sku === sku));
        if (present.length === components.length && components.length > 0) {
          outcomes.push({ label: `Bundle '${b.title}' formed → ${b.bundleSku}`, detail: `Components ${components.join(', ')} merged.`, effect: 'bundled' });
        }
      }
      break;
    }
    case 'functions.fulfillmentConstraints': {
      for (const rule of rules) {
        const when = rule.when ?? {};
        const skuHit = !when.skuIn?.length || input.lineItems.some((li) => when.skuIn.includes(li.sku));
        if (!skuHit) continue;
        if (rule.apply?.shipAlone) outcomes.push({ label: 'Item must ship alone', detail: 'shipAlone constraint applied.', effect: 'constrained' });
        if (rule.apply?.groupWithTag) outcomes.push({ label: `Grouped with tag '${rule.apply.groupWithTag}'`, detail: 'Grouping constraint applied.', effect: 'constrained' });
      }
      break;
    }
    case 'functions.orderRoutingLocationRule': {
      outcomes.push({ label: 'Order routed by location rule', detail: `Evaluated ${rules.length} rule(s) against fixture cart.`, effect: 'routed' });
      break;
    }
    case 'functions.shippingDiscount': {
      const totalQty = input.lineItems.reduce((sum, li) => sum + li.quantity, 0);
      for (const rule of rules) {
        const when = rule.when ?? {};
        const subtotalOk = when.minSubtotal === undefined || subtotal >= when.minSubtotal;
        const qtyOk = when.minQty === undefined || totalQty >= when.minQty;
        const countryOk = !when.countryCodeIn?.length || when.countryCodeIn.includes(input.countryCode);
        // Customer-tag gates are not runtime-evaluable in the pure Function (they are
        // skipped there); mirror that in the preview so it doesn't over-promise.
        const tagFree = !when.customerTags?.length;
        if (!subtotalOk || !qtyOk || !countryOk || !tagFree) continue;
        const pct = rule.apply?.shippingPercentage ?? 0;
        if (pct <= 0) continue;
        const label =
          pct >= 100
            ? `Cart ${money(subtotal, currency)} → FREE shipping`
            : `Cart ${money(subtotal, currency)} → ${pct}% off shipping`;
        outcomes.push({
          label,
          detail:
            pct >= 100
              ? `Delivery waived for ${input.countryCode} (${when.minSubtotal !== undefined ? `over ${money(when.minSubtotal, currency)}` : 'no minimum'}).`
              : `Delivery discounted ${pct}% for ${input.countryCode}.`,
          effect: 'applied',
        });
      }
      break;
    }
    default:
      break;
  }

  if (outcomes.length === 0) {
    outcomes.push({ label: 'No rule matched the fixture', detail: `Cart ${money(subtotal, currency)} did not trigger any configured rule.`, effect: 'none' });
  }

  return PreviewSimulationResultSchema.parse({ kind, outcomes, fallbackNote });
}

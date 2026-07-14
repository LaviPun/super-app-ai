import type { RecipeSpec, DeployTarget } from '@superapp/core';
import { isTargetAllowedForType } from '@superapp/core';
import type { CompileResult } from './types';
import { IncompatibleCompileTargetError } from './types';
import { compileThemeSection } from './theme.section';
import { compileProxyWidget } from './proxy.widget';
import { compileDiscountRules } from './functions.discountRules';
import { compileDeliveryCustomization } from './functions.deliveryCustomization';
import { compilePaymentCustomization } from './functions.paymentCustomization';
import { compileCartAndCheckoutValidation } from './functions.cartAndCheckoutValidation';
import { compileCartTransform } from './functions.cartTransform';
import { compileFulfillmentConstraints } from './functions.fulfillmentConstraints';
import { compileOrderRoutingLocationRule } from './functions.orderRoutingLocationRule';
import { compileShippingDiscount } from './functions.shippingDiscount';
import { compileLocalPickupDeliveryOption } from './functions.localPickupDeliveryOption';
import { compilePickupPointDeliveryOption } from './functions.pickupPointDeliveryOption';
import { compileCheckoutUpsell } from './checkout.upsell';
import { compileCheckoutBlock } from './checkout.block';
import { compilePostPurchaseOffer } from './postPurchase.offer';
import { compileCustomerAccountBlocks } from './customerAccount.blocks';
import { compileAdminBlock } from './admin.block';
import { compileAdminAction } from './admin.action';
import { compileAdminDiscountUi } from './admin.discountUi';
import { compileAdminLink } from './admin.link';
import { compileAdminPrint } from './admin.print';
import { compileAdminSegmentTemplate } from './admin.segmentTemplate';
import { compileAnalyticsPixel } from './analytics.pixel';
import { compileMessagingCampaign } from './messaging.campaign';
import { compileIntegrationHttpSync } from './integration.httpSync';
import { compileFlowAutomation } from './flow.automation';
import { compileAgenticCatalogProfile } from './agentic.catalogProfile';

export function compileRecipe(spec: RecipeSpec, target: DeployTarget): CompileResult {
  // Type↔target compatibility guard (single source of truth: capability graph).
  // A spec compiled against a target its surface can never deploy to is a hard
  // error — the compiler must never silently produce ops for an impossible deploy
  // (e.g. a functions.* or flow.* recipe against a THEME target). Derived from
  // `isTargetAllowedForType`, so it stays in lockstep with the publish-policy
  // allowlist and the eval forbidden-surface gate.
  if (!isTargetAllowedForType(spec.type, target.kind)) {
    throw new IncompatibleCompileTargetError(spec.type, target.kind);
  }

  switch (spec.type) {
    case 'theme.section':
      // The guard above already guarantees target.kind === 'THEME'; this narrows the
      // union for compileThemeSection (and is defence-in-depth against a future edit
      // to the guard). Unreachable in practice.
      if (target.kind !== 'THEME') throw new IncompatibleCompileTargetError(spec.type, target.kind);
      return compileThemeSection(spec, target);
    case 'proxy.widget':
      return compileProxyWidget(spec);
    case 'functions.discountRules':
      return compileDiscountRules(spec);
    case 'functions.deliveryCustomization':
      return compileDeliveryCustomization(spec);
    case 'functions.paymentCustomization':
      return compilePaymentCustomization(spec);
    case 'functions.cartAndCheckoutValidation':
      return compileCartAndCheckoutValidation(spec);
    case 'functions.cartTransform':
      return compileCartTransform(spec);
    case 'functions.fulfillmentConstraints':
      return compileFulfillmentConstraints(spec);
    case 'functions.orderRoutingLocationRule':
      return compileOrderRoutingLocationRule(spec);
    case 'functions.shippingDiscount':
      return compileShippingDiscount(spec);
    case 'functions.localPickupDeliveryOption':
      return compileLocalPickupDeliveryOption(spec);
    case 'functions.pickupPointDeliveryOption':
      return compilePickupPointDeliveryOption(spec);
    case 'checkout.upsell':
      return compileCheckoutUpsell(spec);
    case 'customerAccount.blocks':
      return compileCustomerAccountBlocks(spec);
    case 'admin.block':
      return compileAdminBlock(spec);
    case 'admin.action':
      return compileAdminAction(spec);
    case 'admin.discountUi':
      return compileAdminDiscountUi(spec);
    case 'admin.link':
      return compileAdminLink(spec);
    case 'admin.print':
      return compileAdminPrint(spec);
    case 'admin.segmentTemplate':
      return compileAdminSegmentTemplate(spec);
    case 'analytics.pixel':
      return compileAnalyticsPixel(spec);
    case 'messaging.campaign':
      return compileMessagingCampaign(spec);
    case 'integration.httpSync':
      return compileIntegrationHttpSync(spec);
    case 'agentic.catalogProfile':
      return compileAgenticCatalogProfile(spec);
    case 'checkout.block':
      return compileCheckoutBlock(spec);
    case 'postPurchase.offer':
      return compilePostPurchaseOffer(spec);
    case 'flow.automation':
      return compileFlowAutomation(spec);
    case 'pos.extension':
    case 'platform.extensionBlueprint':
      return { ops: [{ kind: 'AUDIT', action: `compile.${spec.type}` }] };
    default: {
      const _exhaustive: never = spec;
      return _exhaustive;
    }
  }
}

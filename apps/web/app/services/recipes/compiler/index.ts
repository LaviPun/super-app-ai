import type { RecipeSpec, DeployTarget } from '@superapp/core';
import type { CompileResult } from './types';
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
import { compileCheckoutUpsell } from './checkout.upsell';
import { compileCheckoutBlock } from './checkout.block';
import { compilePostPurchaseOffer } from './postPurchase.offer';
import { compileCustomerAccountBlocks } from './customerAccount.blocks';
import { compileAdminBlock } from './admin.block';
import { compileAdminAction } from './admin.action';
import { compileAnalyticsPixel } from './analytics.pixel';
import { compileMessagingCampaign } from './messaging.campaign';
import { compileAgenticCatalogProfile } from './agentic.catalogProfile';

export function compileRecipe(spec: RecipeSpec, target: DeployTarget): CompileResult {
  switch (spec.type) {
    case 'theme.section':
      if (target.kind !== 'THEME') throw new Error('theme.section requires THEME target');
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
    case 'checkout.upsell':
      return compileCheckoutUpsell(spec);
    case 'customerAccount.blocks':
      return compileCustomerAccountBlocks(spec);
    case 'admin.block':
      return compileAdminBlock(spec);
    case 'admin.action':
      return compileAdminAction(spec);
    case 'analytics.pixel':
      return compileAnalyticsPixel(spec);
    case 'messaging.campaign':
      return compileMessagingCampaign(spec);
    case 'agentic.catalogProfile':
      return compileAgenticCatalogProfile(spec);
    case 'checkout.block':
      return compileCheckoutBlock(spec);
    case 'postPurchase.offer':
      return compilePostPurchaseOffer(spec);
    case 'pos.extension':
    case 'integration.httpSync':
    case 'flow.automation':
    case 'platform.extensionBlueprint':
    // admin.discountUi (Spring 2026): declarative today — no admin discount-details
    // extension shipped yet, so it AUDIT-compiles and preflight gates it needs_runtime.
    case 'admin.discountUi':
      return { ops: [{ kind: 'AUDIT', action: `compile.${spec.type}` }] };
    default: {
      const _exhaustive: never = spec;
      return _exhaustive;
    }
  }
}

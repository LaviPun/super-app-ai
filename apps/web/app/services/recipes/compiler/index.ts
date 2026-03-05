import type { RecipeSpec, DeployTarget } from '@superapp/core';
import type { CompileResult } from './types';
import { compileThemeBanner } from './theme.banner';
import { compileThemePopup } from './theme.popup';
import { compileNotificationBar } from './theme.notificationBar';
import { compileThemeEffect } from './theme.effect';
import { compileProxyWidget } from './proxy.widget';
import { compileDiscountRules } from './functions.discountRules';
import { compileDeliveryCustomization } from './functions.deliveryCustomization';
import { compilePaymentCustomization } from './functions.paymentCustomization';
import { compileCartAndCheckoutValidation } from './functions.cartAndCheckoutValidation';
import { compileCartTransform } from './functions.cartTransform';
import { compileCheckoutUpsell } from './checkout.upsell';
import { compileCustomerAccountBlocks } from './customerAccount.blocks';

export function compileRecipe(spec: RecipeSpec, target: DeployTarget): CompileResult {
  switch (spec.type) {
    case 'theme.banner':
      if (target.kind !== 'THEME') throw new Error('theme.banner requires THEME target');
      return compileThemeBanner(spec, target);
    case 'theme.popup':
      if (target.kind !== 'THEME') throw new Error('theme.popup requires THEME target');
      return compileThemePopup(spec, target);
    case 'theme.notificationBar':
      if (target.kind !== 'THEME') throw new Error('theme.notificationBar requires THEME target');
      return compileNotificationBar(spec, target);
    case 'theme.effect':
      if (target.kind !== 'THEME') throw new Error('theme.effect requires THEME target');
      return compileThemeEffect(spec, target);
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
    case 'checkout.upsell':
      return compileCheckoutUpsell(spec);
    case 'customerAccount.blocks':
      return compileCustomerAccountBlocks(spec);
    case 'checkout.block':
    case 'postPurchase.offer':
    case 'admin.block':
    case 'pos.extension':
    case 'analytics.pixel':
    case 'integration.httpSync':
    case 'flow.automation':
    case 'platform.extensionBlueprint':
    case 'functions.fulfillmentConstraints':
    case 'functions.orderRoutingLocationRule':
      return { ops: [{ kind: 'AUDIT', action: `compile.${spec.type}` }] };
    default: {
      const _exhaustive: never = spec;
      return _exhaustive;
    }
  }
}

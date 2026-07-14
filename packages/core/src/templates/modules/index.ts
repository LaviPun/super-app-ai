/**
 * Barrel for the app-extension MODULE template library.
 *
 * Aggregates every unit file's canonical `*_TEMPLATES` array into
 * `MODULE_APP_TEMPLATES`. These are the non-native-section modules: admin blocks
 * & actions, POS, checkout, functions, customer-account, proxy widgets, messaging,
 * flow, integrations, agentic, discount-UI. (theme.section app-blocks live under
 * `../blocks`; native full-page sections live under `../sections`.)
 */
import type { TemplateEntry } from '../types.js';

import { ADMA_B2B_TEMPLATES } from './admin-action-b2b-discount-gift-collection.js';
import { ADMIN_ACTION_ORDER_TEMPLATES } from './admin-action-order.js';
import { ADMIN_ACTION_PRODUCT_CUSTOMER_TEMPLATES } from './admin-action-product-customer.js';
import { ADMIN_BLOCK_B2B_AND_RESOURCE_TEMPLATES } from './admin-block-b2b-and-resource.js';
import { ADMIN_BLOCK_CUSTOMER_DETAILS_TEMPLATES } from './admin-block-customer-details.js';
import { ADMIN_BLOCK_ORDER_DETAILS_TEMPLATES } from './admin-block-order-details.js';
import { ADMIN_BLOCK_PRODUCT_DETAILS_TEMPLATES } from './admin-block-product-details.js';
import { ADMIN_BLOCK_VARIANT_DETAILS_TEMPLATES } from './admin-block-variant-details.js';
import { ADMIN_DISCOUNT_UI_SETTINGS_TEMPLATES } from './admin-discount-ui-settings.js';
import { ADMIN_LINK_WORKFLOW_TEMPLATES } from './admin-link-workflows.js';
import { ADMIN_PRINT_DOCUMENT_TEMPLATES } from './admin-print-documents.js';
import { ADMIN_SEGMENT_TEMPLATE_TEMPLATES } from './admin-segment-templates.js';
import { AGENTIC_CATALOG_FEED_TEMPLATES } from './agentic-catalog-feed.js';
import { ANALYTICS_PIXEL_VENDOR_TEMPLATES } from './analytics-pixel-vendors.js';
import { CHECKOUT_BLOCK_MAIN_TEMPLATES } from './checkout-block-main.js';
import { CHECKOUT_UPSELL_MAIN_TEMPLATES } from './checkout-upsell-main.js';
import { CAB_LOY_TEMPLATES } from './customeraccount-loyalty-hub.js';
import { CUSTOMERACCOUNT_ORDER_BLOCKS_TEMPLATES } from './customeraccount-order-blocks.js';
import { FLOW_LIFECYCLE_OPS_TEMPLATES } from './flow-lifecycle-ops.js';
import { FLOW_LINEAR_RUNNER_TEMPLATES } from './flow-linear-runner.js';
import { FUNCTIONS_CART_TRANSFORM_TEMPLATES } from './functions-cart-transform.js';
import { FN_CHKC_TEMPLATES } from './functions-checkout-customizations.js';
import { FUNCTIONS_DISCOUNT_RULES_TEMPLATES } from './functions-discount-rules.js';
import { FUNCTIONS_SHIPPING_FULFILLMENT_ROUTING_TEMPLATES } from './functions-shipping-fulfillment-routing.js';
import { INTEG_BACKOFFICE_TEMPLATES } from './integration-httpsync-backoffice.js';
import { INTEG_TEMPLATES } from './integration-httpsync-outbound.js';
import { MESSAGING_EMAIL_TEMPLATES } from './messaging-email.js';
import { MESSAGING_LIFECYCLE_TEMPLATES } from './messaging-lifecycle.js';
import { MESSAGING_SLACK_TEMPLATES } from './messaging-slack.js';
import { POS_CHECKIN_EXCHANGE_TEMPLATES } from './pos-checkin-exchange.js';
import { POS_CUSTOMER_AND_CART_TEMPLATES } from './pos-customer-and-cart.js';
import { POS_HOME_LOYALTY_TEMPLATES } from './pos-home-loyalty.js';
import { POS_PRODUCT_ORDER_POST_TEMPLATES } from './pos-product-order-post.js';
import { POSTPURCHASE_THANKYOU_OFFER_TEMPLATES } from './postpurchase-thankyou-offer.js';
import { PROXY_WIDGET_STOREFRONT_AND_ORDER_TEMPLATES } from './proxy-widget-storefront-and-order.js';

export const MODULE_APP_TEMPLATES: TemplateEntry[] = [
  ...ADMA_B2B_TEMPLATES,
  ...ADMIN_ACTION_ORDER_TEMPLATES,
  ...ADMIN_ACTION_PRODUCT_CUSTOMER_TEMPLATES,
  ...ADMIN_BLOCK_B2B_AND_RESOURCE_TEMPLATES,
  ...ADMIN_BLOCK_CUSTOMER_DETAILS_TEMPLATES,
  ...ADMIN_BLOCK_ORDER_DETAILS_TEMPLATES,
  ...ADMIN_BLOCK_PRODUCT_DETAILS_TEMPLATES,
  ...ADMIN_BLOCK_VARIANT_DETAILS_TEMPLATES,
  ...ADMIN_DISCOUNT_UI_SETTINGS_TEMPLATES,
  ...ADMIN_LINK_WORKFLOW_TEMPLATES,
  ...ADMIN_PRINT_DOCUMENT_TEMPLATES,
  ...ADMIN_SEGMENT_TEMPLATE_TEMPLATES,
  ...AGENTIC_CATALOG_FEED_TEMPLATES,
  ...ANALYTICS_PIXEL_VENDOR_TEMPLATES,
  ...CHECKOUT_BLOCK_MAIN_TEMPLATES,
  ...CHECKOUT_UPSELL_MAIN_TEMPLATES,
  ...CAB_LOY_TEMPLATES,
  ...CUSTOMERACCOUNT_ORDER_BLOCKS_TEMPLATES,
  ...FLOW_LIFECYCLE_OPS_TEMPLATES,
  ...FLOW_LINEAR_RUNNER_TEMPLATES,
  ...FUNCTIONS_CART_TRANSFORM_TEMPLATES,
  ...FN_CHKC_TEMPLATES,
  ...FUNCTIONS_DISCOUNT_RULES_TEMPLATES,
  ...FUNCTIONS_SHIPPING_FULFILLMENT_ROUTING_TEMPLATES,
  ...INTEG_BACKOFFICE_TEMPLATES,
  ...INTEG_TEMPLATES,
  ...MESSAGING_EMAIL_TEMPLATES,
  ...MESSAGING_LIFECYCLE_TEMPLATES,
  ...MESSAGING_SLACK_TEMPLATES,
  ...POS_CHECKIN_EXCHANGE_TEMPLATES,
  ...POS_CUSTOMER_AND_CART_TEMPLATES,
  ...POS_HOME_LOYALTY_TEMPLATES,
  ...POS_PRODUCT_ORDER_POST_TEMPLATES,
  ...POSTPURCHASE_THANKYOU_OFFER_TEMPLATES,
  ...PROXY_WIDGET_STOREFRONT_AND_ORDER_TEMPLATES,
];

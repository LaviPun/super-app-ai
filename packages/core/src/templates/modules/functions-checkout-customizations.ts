import type { TemplateEntry } from '../types.js';

/**
 * FN-CHKC — Checkout-customization Function templates (Build #14b widened predicates).
 *
 * Spread across the three delivery/payment/validation Function types, grounded in the
 * shipping-rule + checkout-flow vocabulary of Intuitive Shipping (zones, conditions,
 * method rename/hide, PO-Box + order-limit rules) and Bold Checkout (shipping padding,
 * payment-method surfacing/ordering, split/deferred payment, discount + validation).
 *
 * These are the surviving Shopify-native sliver of those apps: `functions.*` can only
 * hide / rename / reorder existing methods, gate payment methods, and validate the cart
 * — it cannot originate live carrier rates (that needs a CarrierService, out of vocab)
 * or replace the checkout. Every predicate/action below is a real key on the matching
 * RecipeSpec member; tag/collection targeting is expressed via productType/vendor/id
 * because static input-query args (`hasTags`/`inAnyCollection`) can't be config-driven.
 */
export const FN_CHKC_TEMPLATES: TemplateEntry[] = [
  // ── functions.deliveryCustomization ──────────────────────────────────────────
  {
    id: 'FN-CHKC-01',
    name: 'Hide Express Shipping for PO Boxes & Freight',
    description:
      'Delivery Function that hides express/overnight methods when the cart contains freight-only product types — mirrors Intuitive Shipping PO-Box + per-product exclusions on the shipping-option list.',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'delivery-customization', 'hide-method', 'freight', 'checkout'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'Hide Express Shipping for PO Boxes & Freight',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: { productTypeIn: ['Freight', 'Oversized', 'Furniture'] },
            actions: { hideMethodsContaining: ['Express', 'Overnight', 'Next Day'] },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-02',
    name: 'Rename Shipping Methods to Branded Titles',
    description:
      'Delivery Function that renames the standard shipping option to a branded, benefit-led title at checkout — the Intuitive Shipping method-title/description pattern (custom branded naming up to 90 chars).',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'delivery-customization', 'rename-method', 'branding', 'checkout'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'Rename Shipping Methods to Branded Titles',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: {},
            actions: { renameMethod: { contains: 'Standard', to: 'Free Carbon-Neutral Delivery (3-5 days)' } },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-03',
    name: 'Priority Shipping for VIP Customers',
    description:
      'Delivery Function that promotes express delivery to the top of the option list for tagged VIP customers (matched by customer id) — the Intuitive Shipping customer-group condition, expressed via customerIdIn.',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'delivery-customization', 'reorder-priority', 'vip', 'loyalty'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'Priority Shipping for VIP Customers',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: { customerIdIn: ['gid://shopify/Customer/1234567890'] },
            actions: { reorderPriority: 0 },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-04',
    name: 'Hide Standard Shipping over Free-Shipping Threshold',
    description:
      'Delivery Function that hides paid standard shipping once the cart subtotal clears a free-shipping threshold — the Intuitive Shipping free-shipping-threshold + hide-rates behavior on the checkout option list.',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'delivery-customization', 'free-shipping', 'hide-method', 'threshold'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'Hide Standard Shipping over Free-Shipping Threshold',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: { minSubtotal: 75 },
            actions: { hideMethodsContaining: ['Standard Shipping', 'Economy'] },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-05',
    name: 'Vendor Dropship Shipping Rename',
    description:
      'Delivery Function that renames the shipping option for a specific dropship vendor to flag a longer handoff time — the Intuitive Shipping per-vendor / product-specific shipping condition, expressed via vendorIn.',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['bold-checkout', 'shipping', 'delivery-customization', 'rename-method', 'dropship', 'vendor'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'Vendor Dropship Shipping Rename',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: { vendorIn: ['Artisan Partners Co.'] },
            actions: { renameMethod: { contains: 'Standard', to: 'Ships direct from maker (7-10 days)' } },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-06',
    name: 'Regional Delivery Restriction (Remote Provinces)',
    description:
      'Delivery Function that hides express methods for remote provinces where carriers cannot honor next-day estimates — the Intuitive Shipping zone/subzone restriction, expressed via country + province predicates.',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'delivery-customization', 'zones', 'province', 'hide-method'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'Regional Delivery Restriction (Remote Provinces)',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: { countryCodeIn: ['CA'], provinceCodeIn: ['YT', 'NT', 'NU'] },
            actions: { hideMethodsContaining: ['Express', 'Next Day'] },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-07',
    name: 'Loyalty Reorder: Free Method Top for Repeat Buyers',
    description:
      'Delivery Function that surfaces the free shipping option first for customers with a prior-order history — the Intuitive Shipping prev-order-count customer condition, expressed via minCustomerOrders.',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'delivery-customization', 'reorder-priority', 'loyalty', 'returning-customer'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'Loyalty Reorder: Free Method Top for Repeat Buyers',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: { minCustomerOrders: 3 },
            actions: { renameMethod: { contains: 'Standard', to: 'Free Shipping — thanks for coming back' }, reorderPriority: 0 },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-08',
    name: 'Hide Overnight for Heavy Variants',
    description:
      'Delivery Function that hides overnight/air methods when specific heavy or hazmat variants are in the cart — the Intuitive Shipping per-item exclusion, expressed via productVariantIdIn.',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'delivery-customization', 'hide-method', 'hazmat', 'variant'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'Hide Overnight for Heavy Variants',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: { productVariantIdIn: ['gid://shopify/ProductVariant/40000000001', 'gid://shopify/ProductVariant/40000000002'] },
            actions: { hideMethodsContaining: ['Overnight', 'Air', 'Same Day'] },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-09',
    name: 'High-Value Order Signature Method Priority',
    description:
      'Delivery Function that promotes a signature-required method to the top when the cart subtotal is high — the Intuitive Shipping signature-required option + order-total condition, on the checkout option list.',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'delivery-customization', 'reorder-priority', 'high-value', 'signature'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'High-Value Order Signature Method Priority',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: { minSubtotal: 500 },
            actions: { renameMethod: { contains: 'Standard', to: 'Signature Required — insured delivery' }, reorderPriority: 0 },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-10',
    name: 'Perishable Product-Type Cold-Chain Rename',
    description:
      'Delivery Function that renames the shipping option for perishable product types to advertise insulated cold-chain packing — the Intuitive Shipping product-type condition + custom method messaging.',
    category: 'FUNCTION',
    type: 'functions.deliveryCustomization',
    icon: 'shipping',
    tags: ['intuitive-shipping', 'shipping', 'delivery-customization', 'rename-method', 'perishable', 'cold-chain'],
    spec: {
      type: 'functions.deliveryCustomization',
      name: 'Perishable Product-Type Cold-Chain Rename',
      category: 'FUNCTION',
      requires: ['SHIPPING_FUNCTION'],
      config: {
        rules: [
          {
            when: { productTypeIn: ['Perishable', 'Frozen', 'Fresh Produce'] },
            actions: { renameMethod: { contains: 'Express', to: 'Express Cold-Chain (insulated + gel packs)' } },
          },
        ],
      },
    },
  },

  // ── functions.paymentCustomization ───────────────────────────────────────────
  {
    id: 'FN-CHKC-11',
    name: 'Hide COD over Order-Value Cap',
    description:
      'Payment Function that hides cash-on-delivery once the cart clears a value cap to limit COD risk — mirrors Bold Checkout payment-method surfacing gated by order value.',
    category: 'FUNCTION',
    type: 'functions.paymentCustomization',
    icon: 'payment',
    tags: ['bold-checkout', 'payment', 'payment-customization', 'hide-method', 'cod', 'checkout'],
    spec: {
      type: 'functions.paymentCustomization',
      name: 'Hide COD over Order-Value Cap',
      category: 'FUNCTION',
      requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
      config: {
        rules: [
          {
            when: { minSubtotal: 200 },
            actions: { hideMethodsContaining: ['Cash on Delivery', 'COD'] },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-12',
    name: 'Reorder Wallets First by Currency',
    description:
      'Payment Function that promotes wallet methods to the top for a given billing currency — the Bold Checkout multi-currency + payment-method ordering behavior at checkout.',
    category: 'FUNCTION',
    type: 'functions.paymentCustomization',
    icon: 'payment',
    tags: ['bold-checkout', 'payment', 'payment-customization', 'reorder-priority', 'wallet', 'multi-currency'],
    spec: {
      type: 'functions.paymentCustomization',
      name: 'Reorder Wallets First by Currency',
      category: 'FUNCTION',
      requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
      config: {
        rules: [
          {
            when: { currencyIn: ['EUR', 'GBP'] },
            actions: { reorderPriority: 0, renameMethod: { contains: 'Shop Pay', to: 'Shop Pay — fastest checkout' } },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-13',
    name: 'Require Manual Review for High-Value Orders',
    description:
      'Payment Function that flags high-value orders for manual review before payment proceeds — the Bold Checkout anti-fraud gate, using the requireReview action on an order-value predicate.',
    category: 'FUNCTION',
    type: 'functions.paymentCustomization',
    icon: 'payment',
    tags: ['bold-checkout', 'payment', 'payment-customization', 'fraud', 'require-review', 'high-value'],
    spec: {
      type: 'functions.paymentCustomization',
      name: 'Require Manual Review for High-Value Orders',
      category: 'FUNCTION',
      requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
      config: {
        rules: [
          {
            when: { minSubtotal: 1000 },
            actions: { requireReview: true },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-14',
    name: 'Hide Installments for Restricted Product Types',
    description:
      'Payment Function that hides installment / buy-now-pay-later methods when gift cards or final-sale product types are in the cart — the Bold Checkout installment ("5 Easy Payments") gated by cart contents.',
    category: 'FUNCTION',
    type: 'functions.paymentCustomization',
    icon: 'payment',
    tags: ['bold-checkout', 'payment', 'payment-customization', 'hide-method', 'installments', 'bnpl'],
    spec: {
      type: 'functions.paymentCustomization',
      name: 'Hide Installments for Restricted Product Types',
      category: 'FUNCTION',
      requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
      config: {
        rules: [
          {
            when: { productTypeIn: ['Gift Card', 'Final Sale', 'Digital'] },
            actions: { hideMethodsContaining: ['Installments', 'Pay Later', 'Affirm', 'Klarna'] },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-15',
    name: 'Regional Payment Gating (Province-Restricted Method)',
    description:
      'Payment Function that hides a payment method not licensed in specific provinces — the Bold Checkout payment-gateway-availability targeting, expressed via country + province predicates.',
    category: 'FUNCTION',
    type: 'functions.paymentCustomization',
    icon: 'payment',
    tags: ['bold-checkout', 'payment', 'payment-customization', 'hide-method', 'province', 'compliance'],
    spec: {
      type: 'functions.paymentCustomization',
      name: 'Regional Payment Gating (Province-Restricted Method)',
      category: 'FUNCTION',
      requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
      config: {
        rules: [
          {
            when: { countryCodeIn: ['US'], provinceCodeIn: ['NY', 'WA'] },
            actions: { hideMethodsContaining: ['Crypto', 'Money Order'] },
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-16',
    name: 'Vendor Wholesale Net-Terms Priority',
    description:
      'Payment Function that promotes a net-terms / invoice method to the top when wholesale vendor products are in the cart — the Bold Checkout B2B customer-specific payment flow, expressed via vendorIn.',
    category: 'FUNCTION',
    type: 'functions.paymentCustomization',
    icon: 'payment',
    tags: ['bold-checkout', 'payment', 'payment-customization', 'reorder-priority', 'b2b', 'net-terms'],
    spec: {
      type: 'functions.paymentCustomization',
      name: 'Vendor Wholesale Net-Terms Priority',
      category: 'FUNCTION',
      requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
      config: {
        rules: [
          {
            when: { vendorIn: ['Wholesale Supply Co.'] },
            actions: { renameMethod: { contains: 'Invoice', to: 'Net 30 Terms (approved accounts)' }, reorderPriority: 0 },
          },
        ],
      },
    },
  },

  // ── functions.cartAndCheckoutValidation ──────────────────────────────────────
  {
    id: 'FN-CHKC-17',
    name: 'Purchase Limit per SKU',
    description:
      'Validation Function that blocks checkout when a single SKU exceeds a per-order quantity cap — the Intuitive Shipping / Bold order-limit rule enforced at cart-and-checkout validation with a buyer-facing message.',
    category: 'FUNCTION',
    type: 'functions.cartAndCheckoutValidation',
    icon: 'checkout',
    tags: ['intuitive-shipping', 'validation', 'cart-validation', 'purchase-limit', 'quantity', 'checkout'],
    spec: {
      type: 'functions.cartAndCheckoutValidation',
      name: 'Purchase Limit per SKU',
      category: 'FUNCTION',
      requires: ['VALIDATION_FUNCTION'],
      config: {
        rules: [
          {
            when: { maxQuantityPerSku: 5 },
            errorMessage: 'You can order up to 5 of each item per order. Please adjust your cart.',
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-18',
    name: 'Minimum & Maximum Order Value Guard',
    description:
      'Validation Function that blocks checkout below a minimum or above a maximum cart value — the Intuitive Shipping minimum-order-value / order-limit rule, enforced with min/max cart-value predicates.',
    category: 'FUNCTION',
    type: 'functions.cartAndCheckoutValidation',
    icon: 'checkout',
    tags: ['intuitive-shipping', 'validation', 'cart-validation', 'minimum-order', 'order-value', 'checkout'],
    spec: {
      type: 'functions.cartAndCheckoutValidation',
      name: 'Minimum & Maximum Order Value Guard',
      category: 'FUNCTION',
      requires: ['VALIDATION_FUNCTION'],
      config: {
        rules: [
          {
            when: { minCartValue: 25 },
            errorMessage: 'Orders must total at least $25 to check out.',
          },
          {
            when: { maxCartValue: 10000 },
            errorMessage: 'This order exceeds our online limit of $10,000 — please contact sales for large orders.',
          },
        ],
      },
    },
  },
  {
    id: 'FN-CHKC-19',
    name: 'Block Restricted Shipping Regions',
    description:
      'Validation Function that blocks checkout for destinations the merchant does not ship to — the Intuitive Shipping zone-restriction (block out-of-zone customers), using blockCountryCodes / blockProvinceCodes.',
    category: 'FUNCTION',
    type: 'functions.cartAndCheckoutValidation',
    icon: 'checkout',
    tags: ['intuitive-shipping', 'validation', 'cart-validation', 'zones', 'shipping-restriction', 'address'],
    spec: {
      type: 'functions.cartAndCheckoutValidation',
      name: 'Block Restricted Shipping Regions',
      category: 'FUNCTION',
      requires: ['VALIDATION_FUNCTION'],
      config: {
        rules: [
          {
            when: { blockCountryCodes: ['CU', 'IR', 'KP'] },
            errorMessage: 'We are unable to ship to this destination. Please use a different shipping address.',
          },
          {
            when: { blockCountryCodes: ['US'], blockProvinceCodes: ['HI', 'AK'] },
            errorMessage: 'This item cannot be shipped to Hawaii or Alaska. Please remove it or change your address.',
          },
        ],
      },
    },
  },
];

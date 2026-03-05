import type { RecipeSpec } from './recipe.js';
import type { TemplateEntry } from './templates.js';
import { THEME_PLACEABLE_TEMPLATES } from './allowed-values.js';

export const PART1_TEMPLATES: TemplateEntry[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // Category 1: Upsell & AOV (UAO-001 to UAO-009)
  // ═══════════════════════════════════════════════════════════════════════════════

  // UAO-001: Cart Upsell Strip
  {
    id: 'UAO-001',
    name: 'Cart Upsell Strip',
    description: 'Banner on the cart page encouraging add-ons to reach free shipping threshold.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['upsell', 'cart', 'aov'],
    spec: {
      type: 'theme.banner',
      name: 'Cart Upsell Strip',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Add X to get free shipping',
        subheading: 'You are so close! Add a few more items to unlock free delivery.',
        ctaText: 'Browse Add-Ons',
        ctaUrl: 'https://example.com/collections/add-ons',
        enableAnimation: false,
      },
      placement: { enabled_on: { templates: ['cart'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium' },
        typography: { size: 'MD', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#ffffff', background: '#2563eb', buttonBg: '#ffffff', buttonText: '#2563eb' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'sm' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // UAO-002: PDP Cross-Sell Carousel
  {
    id: 'UAO-002',
    name: 'PDP Cross-Sell Carousel',
    description: 'Frequently bought together banner on product pages to drive cross-sells.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['cross-sell', 'product', 'carousel'],
    spec: {
      type: 'theme.banner',
      name: 'PDP Cross-Sell Carousel',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Frequently Bought Together',
        subheading: 'Customers who purchased this item also loved these picks.',
        ctaText: 'View All',
        ctaUrl: 'https://example.com/collections/best-sellers',
        enableAnimation: false,
      },
      placement: { enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { text: '#1e293b', background: '#f8fafc', buttonBg: '#0f172a', buttonText: '#ffffff' },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // UAO-003: Collection Add-On Tiles
  {
    id: 'UAO-003',
    name: 'Collection Add-On Tiles',
    description: 'Upsell banner on collection pages prompting shoppers to complete their look.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['upsell', 'collection', 'add-on'],
    spec: {
      type: 'theme.banner',
      name: 'Collection Add-On Tiles',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Complete Your Look',
        subheading: 'Pair these items together for the perfect outfit.',
        ctaText: 'Shop Now',
        ctaUrl: 'https://example.com/collections/accessories',
        enableAnimation: false,
      },
      placement: { enabled_on: { templates: ['collection'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#ffffff', background: '#7c3aed', buttonBg: '#ffffff', buttonText: '#7c3aed' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'md' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // UAO-004: Free-Shipping Ladder + Add-Ons
  {
    id: 'UAO-004',
    name: 'Free-Shipping Ladder + Add-Ons',
    description: 'Notification bar showing free shipping progress and suggesting add-on items.',
    category: 'STOREFRONT_UI',
    type: 'theme.notificationBar',
    icon: 'notification',
    tags: ['shipping', 'progress', 'upsell'],
    spec: {
      type: 'theme.notificationBar',
      name: 'Free-Shipping Ladder + Add-Ons',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        message: 'You are $25 away from FREE shipping! Add an item to qualify.',
        linkText: 'See suggestions',
        linkUrl: 'https://example.com/collections/under-25',
        dismissible: false,
      },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'medium' },
        typography: { size: 'SM', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#ffffff', background: '#059669' },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // UAO-005: Checkout Line-Item Cross-Sell
  {
    id: 'UAO-005',
    name: 'Checkout Line-Item Cross-Sell',
    description: 'Checkout block suggesting related products next to each cart line item.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'upsell', 'plus'],
    spec: {
      type: 'checkout.block',
      name: 'Checkout Line-Item Cross-Sell',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        target: 'purchase.checkout.cart-line-item.render-after',
        title: 'You might also like',
        message: 'Customers who bought this also added these items.',
      },
    } as RecipeSpec,
  },

  // UAO-006: Checkout Reductions Upsell
  {
    id: 'UAO-006',
    name: 'Checkout Reductions Upsell',
    description: 'Upsell block near the discounts section in checkout to increase AOV.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'reductions', 'upsell'],
    spec: {
      type: 'checkout.block',
      name: 'Checkout Reductions Upsell',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        target: 'purchase.checkout.reductions.render-after',
        title: 'Save more with add-ons',
        message: 'Add one more item to unlock an extra 10% off your entire order.',
      },
    } as RecipeSpec,
  },

  // UAO-007: Thank-You Upsell Block
  {
    id: 'UAO-007',
    name: 'Thank-You Upsell Block',
    description: 'Post-purchase recommendation block on the thank-you page.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['thank-you', 'upsell', 'post-purchase'],
    spec: {
      type: 'checkout.block',
      name: 'Thank-You Upsell Block',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        target: 'purchase.thank-you.block.render',
        title: 'Recommended for you',
        message: 'Based on your purchase, you might love these products.',
      },
    } as RecipeSpec,
  },

  // UAO-008: Account Reorder Action
  {
    id: 'UAO-008',
    name: 'Account Reorder Action',
    description: 'Quick reorder action in the customer account order menu.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['account', 'reorder', 'action'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Account Reorder Action',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order.action.menu-item.render',
        title: 'Reorder',
        blocks: [
          { kind: 'LINK', content: 'Reorder this purchase', url: 'https://example.com/reorder' },
          { kind: 'TEXT', content: 'Quickly add all items from this order back to your cart.' },
        ],
        b2bOnly: false,
      },
    } as RecipeSpec,
  },

  // UAO-009: POS Upsell Assistant
  {
    id: 'UAO-009',
    name: 'POS Upsell Assistant',
    description: 'POS extension suggesting add-on products to staff during checkout.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'upsell', 'staff'],
    spec: {
      type: 'pos.extension',
      name: 'POS Upsell Assistant',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.cart.line-item-details.action.render',
        label: 'Suggested Add-Ons',
        blockKind: 'action',
      },
    } as RecipeSpec,
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // Category 2: Discounts & Pricing (DAP-010 to DAP-018)
  // ═══════════════════════════════════════════════════════════════════════════════

  // DAP-010: Tiered Cart Discount
  {
    id: 'DAP-010',
    name: 'Tiered Cart Discount',
    description: 'Automatic percentage discount that increases with cart subtotal tiers.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['discount', 'tiered', 'cart'],
    spec: {
      type: 'functions.discountRules',
      name: 'Tiered Cart Discount',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [
          { when: { minSubtotal: 50 }, apply: { percentageOff: 5 } },
          { when: { minSubtotal: 100 }, apply: { percentageOff: 10 } },
          { when: { minSubtotal: 200 }, apply: { percentageOff: 15 } },
        ],
        combineWithOtherDiscounts: true,
      },
    } as RecipeSpec,
  },

  // DAP-011: BOGO Discount
  {
    id: 'DAP-011',
    name: 'BOGO Discount',
    description: 'Buy one get one free discount applied to eligible SKUs.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['discount', 'bogo', 'promotion'],
    spec: {
      type: 'functions.discountRules',
      name: 'BOGO Discount',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [
          { when: { skuIn: ['BOGO-ELIGIBLE-001', 'BOGO-ELIGIBLE-002'] }, apply: { percentageOff: 100 } },
        ],
        combineWithOtherDiscounts: false,
      },
    } as RecipeSpec,
  },

  // DAP-012: VIP Customer Discount
  {
    id: 'DAP-012',
    name: 'VIP Customer Discount',
    description: 'Exclusive discount for customers tagged as VIP members.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['discount', 'vip', 'loyalty'],
    spec: {
      type: 'functions.discountRules',
      name: 'VIP Customer Discount',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [
          { when: { customerTags: ['VIP'] }, apply: { percentageOff: 20 } },
        ],
        combineWithOtherDiscounts: true,
      },
    } as RecipeSpec,
  },

  // DAP-013: Shipping Discount + Messaging
  {
    id: 'DAP-013',
    name: 'Shipping Discount + Messaging',
    description: 'Fixed shipping discount for orders above a threshold with messaging.',
    category: 'FUNCTION',
    type: 'functions.discountRules',
    icon: 'discount',
    tags: ['discount', 'shipping', 'messaging'],
    spec: {
      type: 'functions.discountRules',
      name: 'Shipping Discount + Messaging',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: {
        rules: [
          { when: { minSubtotal: 75 }, apply: { fixedAmountOff: 10 } },
        ],
        combineWithOtherDiscounts: true,
      },
    } as RecipeSpec,
  },

  // DAP-014: First-Order Discount Banner
  {
    id: 'DAP-014',
    name: 'First-Order Discount Banner',
    description: 'Homepage banner welcoming new customers with a first-order discount.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['discount', 'first-order', 'welcome'],
    spec: {
      type: 'theme.banner',
      name: 'First-Order Discount Banner',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Welcome! 15% off your first order',
        subheading: 'Use code WELCOME15 at checkout. Valid for new customers only.',
        ctaText: 'Shop Now',
        ctaUrl: 'https://example.com/collections/all',
        enableAnimation: true,
      },
      placement: { enabled_on: { templates: ['index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#ffffff', background: '#dc2626', buttonBg: '#ffffff', buttonText: '#dc2626' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'md' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // DAP-015: Checkout Savings Breakdown
  {
    id: 'DAP-015',
    name: 'Checkout Savings Breakdown',
    description: 'Checkout block showing a detailed breakdown of all applied savings.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'savings', 'breakdown'],
    spec: {
      type: 'checkout.block',
      name: 'Checkout Savings Breakdown',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        target: 'purchase.checkout.cart-line-list.render-after',
        title: 'Your Savings',
        message: 'Here is a breakdown of all discounts applied to your order.',
      },
    } as RecipeSpec,
  },

  // DAP-016: Thank-You "You Saved" Receipt
  {
    id: 'DAP-016',
    name: 'Thank-You "You Saved" Receipt',
    description: 'Thank-you page block displaying total savings on the completed order.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['thank-you', 'savings', 'receipt'],
    spec: {
      type: 'checkout.block',
      name: 'Thank-You "You Saved" Receipt',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        target: 'purchase.thank-you.cart-line-list.render-after',
        title: 'You Saved',
        message: 'Great news! You saved on this order with applied discounts.',
      },
    } as RecipeSpec,
  },

  // DAP-017: Admin Discount Builder
  {
    id: 'DAP-017',
    name: 'Admin Discount Builder',
    description: 'Admin block for configuring discount function rules in Shopify Admin.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'discount', 'builder'],
    spec: {
      type: 'admin.block',
      name: 'Admin Discount Builder',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.discount-details.function-settings.render',
        label: 'Discount Rules',
      },
    } as RecipeSpec,
  },

  // DAP-018: Promo Schedule Automation
  {
    id: 'DAP-018',
    name: 'Promo Schedule Automation',
    description: 'Scheduled flow that auto-tags orders during promotional periods.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tags: ['flow', 'promo', 'schedule'],
    spec: {
      type: 'flow.automation',
      name: 'Promo Schedule Automation',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SCHEDULED',
        steps: [
          { kind: 'TAG_ORDER', tags: 'promo-active' },
        ],
      },
    } as RecipeSpec,
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // Category 3: Bundles & Cart Transform (BCT-019 to BCT-027)
  // ═══════════════════════════════════════════════════════════════════════════════

  // BCT-019: Fixed Bundle Builder
  {
    id: 'BCT-019',
    name: 'Fixed Bundle Builder',
    description: 'Pre-defined product bundle that combines specific SKUs into one cart line.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['bundle', 'product', 'builder'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Fixed Bundle Builder',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'BUNDLE',
        bundles: [
          {
            title: 'Essentials Starter Kit',
            componentSkus: ['ESS-001', 'ESS-002', 'ESS-003'],
            bundleSku: 'BUNDLE-ESS-KIT',
          },
        ],
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Bundling requires Shopify Plus.',
        },
      },
    } as RecipeSpec,
  },

  // BCT-020: Mix-and-Match Bundle
  {
    id: 'BCT-020',
    name: 'Mix-and-Match Bundle',
    description: 'Flexible bundle allowing customers to pick items from a collection.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['bundle', 'mix-match', 'collection'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Mix-and-Match Bundle',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'BUNDLE',
        bundles: [
          {
            title: 'Pick Any 3 Bundle',
            componentSkus: ['MIX-A', 'MIX-B', 'MIX-C', 'MIX-D', 'MIX-E'],
            bundleSku: 'BUNDLE-MIX3',
          },
        ],
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Mix-and-match bundles require Shopify Plus.',
        },
      },
    } as RecipeSpec,
  },

  // BCT-021: Pack-Size Normalize
  {
    id: 'BCT-021',
    name: 'Pack-Size Normalize',
    description: 'Normalizes multi-pack quantities into a single bundled cart line.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['bundle', 'pack', 'normalize'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Pack-Size Normalize',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'BUNDLE',
        bundles: [
          {
            title: '6-Pack Value Bundle',
            componentSkus: ['ITEM-SINGLE', 'ITEM-SINGLE'],
            bundleSku: 'PACK-6',
          },
        ],
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Pack normalization requires Shopify Plus.',
        },
      },
    } as RecipeSpec,
  },

  // BCT-022: Gift With Purchase
  {
    id: 'BCT-022',
    name: 'Gift With Purchase',
    description: 'Automatically bundles a free gift item when qualifying products are in cart.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['bundle', 'gift', 'gwp'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Gift With Purchase',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'BUNDLE',
        bundles: [
          {
            title: 'Free Gift Bundle',
            componentSkus: ['QUALIFYING-PROD', 'FREE-GIFT-SKU'],
            bundleSku: 'GWP-BUNDLE-001',
          },
        ],
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Gift bundles require Shopify Plus.',
        },
      },
    } as RecipeSpec,
  },

  // BCT-023: Bundle + Discount Combo
  {
    id: 'BCT-023',
    name: 'Bundle + Discount Combo',
    description: 'Product bundle with a combined discount applied at cart transform.',
    category: 'FUNCTION',
    type: 'functions.cartTransform',
    icon: 'cart',
    tags: ['bundle', 'discount', 'combo'],
    spec: {
      type: 'functions.cartTransform',
      name: 'Bundle + Discount Combo',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: {
        mode: 'BUNDLE',
        bundles: [
          {
            title: 'Savings Combo Pack',
            componentSkus: ['COMBO-A', 'COMBO-B', 'COMBO-C'],
            bundleSku: 'BUNDLE-COMBO-SAVE',
          },
        ],
        fallbackTheme: {
          enabled: true,
          notificationMessage: 'Combo bundles require Shopify Plus.',
        },
      },
    } as RecipeSpec,
  },

  // BCT-024: Checkout Bundle Applied Note
  {
    id: 'BCT-024',
    name: 'Checkout Bundle Applied Note',
    description: 'Checkout block confirming which bundles were applied to the order.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['checkout', 'bundle', 'note'],
    spec: {
      type: 'checkout.block',
      name: 'Checkout Bundle Applied Note',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        target: 'purchase.checkout.cart-line-list.render-after',
        title: 'Bundle Applied',
        message: 'Your bundle discount has been automatically applied to this order.',
      },
    } as RecipeSpec,
  },

  // BCT-025: Thank-You Bundle Education
  {
    id: 'BCT-025',
    name: 'Thank-You Bundle Education',
    description: 'Thank-you page block educating customers about their purchased bundle.',
    category: 'STOREFRONT_UI',
    type: 'checkout.block',
    icon: 'checkout',
    tags: ['thank-you', 'bundle', 'education'],
    spec: {
      type: 'checkout.block',
      name: 'Thank-You Bundle Education',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        target: 'purchase.thank-you.block.render',
        title: 'Your Bundle',
        message: 'You purchased a bundle! Each item will be shipped together for your convenience.',
      },
    } as RecipeSpec,
  },

  // BCT-026: Admin Bundle Debug Card
  {
    id: 'BCT-026',
    name: 'Admin Bundle Debug Card',
    description: 'Admin order detail block showing bundle composition and debug info.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'bundle', 'debug'],
    spec: {
      type: 'admin.block',
      name: 'Admin Bundle Debug Card',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.block.render',
        label: 'Bundle Details',
      },
    } as RecipeSpec,
  },

  // BCT-027: Flow Bundle Exception Alerts
  {
    id: 'BCT-027',
    name: 'Flow Bundle Exception Alerts',
    description: 'Automated flow that emails the team when a bundle order has issues.',
    category: 'FLOW',
    type: 'flow.automation',
    icon: 'flow',
    tags: ['flow', 'bundle', 'alert'],
    spec: {
      type: 'flow.automation',
      name: 'Flow Bundle Exception Alerts',
      category: 'FLOW',
      requires: [],
      config: {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [
          {
            kind: 'SEND_EMAIL_NOTIFICATION',
            to: 'ops@example.com',
            subject: 'Bundle Exception Alert - Order {{order.id}}',
            body: 'An order containing a bundle may have issues. Please review order {{order.id}} for bundle integrity.',
          },
        ],
      },
    } as RecipeSpec,
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // Category 4: Cart UX & Conversion (CUX-028 to CUX-036)
  // ═══════════════════════════════════════════════════════════════════════════════

  // CUX-028: Cart Donation Module
  {
    id: 'CUX-028',
    name: 'Cart Donation Module',
    description: 'Banner on the cart page allowing customers to add a charitable donation.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['cart', 'donation', 'charity'],
    spec: {
      type: 'theme.banner',
      name: 'Cart Donation Module',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Add a Donation',
        subheading: 'Round up your order to support our charity partner.',
        ctaText: 'Add $1',
        ctaUrl: 'https://example.com/donate',
        enableAnimation: false,
      },
      placement: { enabled_on: { templates: ['cart'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#1e293b', background: '#ecfdf5', buttonBg: '#10b981', buttonText: '#ffffff' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // CUX-029: Gift Wrap Selector
  {
    id: 'CUX-029',
    name: 'Gift Wrap Selector',
    description: 'Cart page banner offering gift wrapping as an add-on service.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['cart', 'gift-wrap', 'upsell'],
    spec: {
      type: 'theme.banner',
      name: 'Gift Wrap Selector',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Add Gift Wrapping',
        subheading: 'Make it special with premium gift wrapping for just $5.',
        ctaText: 'Add Gift Wrap',
        ctaUrl: 'https://example.com/gift-wrap',
        enableAnimation: false,
      },
      placement: { enabled_on: { templates: ['cart'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#ffffff', background: '#be185d', buttonBg: '#ffffff', buttonText: '#be185d' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'sm' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // CUX-030: Order Note + Delivery Instructions
  {
    id: 'CUX-030',
    name: 'Order Note + Delivery Instructions',
    description: 'Cart banner prompting customers to add delivery instructions.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['cart', 'notes', 'delivery'],
    spec: {
      type: 'theme.banner',
      name: 'Order Note + Delivery Instructions',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Delivery Instructions',
        subheading: 'Have special delivery requirements? Leave a note for our team.',
        enableAnimation: false,
      },
      placement: { enabled_on: { templates: ['cart'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { text: '#1e293b', background: '#f1f5f9' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // CUX-031: Shipping Estimator (Cart)
  {
    id: 'CUX-031',
    name: 'Shipping Estimator (Cart)',
    description: 'Cart banner displaying estimated shipping costs before checkout.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['cart', 'shipping', 'estimator'],
    spec: {
      type: 'theme.banner',
      name: 'Shipping Estimator (Cart)',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Estimated Shipping',
        subheading: 'Enter your zip code at checkout for exact rates. Most orders ship free over $75.',
        ctaText: 'Proceed to Checkout',
        ctaUrl: 'https://example.com/checkout',
        enableAnimation: false,
      },
      placement: { enabled_on: { templates: ['cart'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { text: '#374151', background: '#eff6ff', buttonBg: '#2563eb', buttonText: '#ffffff' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // CUX-032: Cart Trust Panel
  {
    id: 'CUX-032',
    name: 'Cart Trust Panel',
    description: 'Trust and security badges banner displayed on the cart page.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['cart', 'trust', 'security'],
    spec: {
      type: 'theme.banner',
      name: 'Cart Trust Panel',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Shop With Confidence',
        subheading: 'SSL encrypted checkout. 30-day returns. 24/7 customer support.',
        enableAnimation: false,
      },
      placement: { enabled_on: { templates: ['cart'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#166534', background: '#f0fdf4' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // CUX-033: Cart Exit-Intent Offer
  {
    id: 'CUX-033',
    name: 'Cart Exit-Intent Offer',
    description: 'Popup triggered on exit intent from the cart page with a special offer.',
    category: 'STOREFRONT_UI',
    type: 'theme.popup',
    icon: 'popup',
    tags: ['cart', 'exit-intent', 'popup'],
    spec: {
      type: 'theme.popup',
      name: 'Cart Exit-Intent Offer',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        title: 'Wait! Special offer',
        body: 'Complete your purchase now and get 10% off with code STAY10.',
        trigger: 'ON_EXIT_INTENT',
        delaySeconds: 0,
        frequency: 'ONCE_PER_SESSION',
        maxShowsPerDay: 1,
        showOnPages: 'CART',
        customPageUrls: [],
        showCloseButton: true,
        autoCloseSeconds: 0,
        countdownEnabled: false,
        countdownSeconds: 0,
        countdownLabel: '',
        ctaText: 'Apply & Checkout',
        ctaUrl: 'https://example.com/checkout?discount=STAY10',
      },
      style: {
        layout: { mode: 'overlay', anchor: 'center', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'modal' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#1e293b', background: '#ffffff', buttonBg: '#dc2626', buttonText: '#ffffff', overlayBackdropOpacity: 0.5 },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'lg' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // CUX-034: Cart Minimum Order Warning
  {
    id: 'CUX-034',
    name: 'Cart Minimum Order Warning',
    description: 'Cart banner warning customers about minimum order requirements.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['cart', 'validation', 'minimum'],
    spec: {
      type: 'theme.banner',
      name: 'Cart Minimum Order Warning',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Minimum Order Required',
        subheading: 'A minimum order of $25 is required for checkout. Add more items to proceed.',
        ctaText: 'Continue Shopping',
        ctaUrl: 'https://example.com/collections/all',
        enableAnimation: false,
      },
      placement: { enabled_on: { templates: ['cart'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium' },
        typography: { size: 'MD', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#92400e', background: '#fffbeb', buttonBg: '#d97706', buttonText: '#ffffff' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // CUX-035: Cart "Only X Left" Urgency
  {
    id: 'CUX-035',
    name: 'Cart "Only X Left" Urgency',
    description: 'Product page banner creating urgency with low stock messaging.',
    category: 'STOREFRONT_UI',
    type: 'theme.banner',
    icon: 'banner',
    tags: ['urgency', 'inventory', 'product'],
    spec: {
      type: 'theme.banner',
      name: 'Cart "Only X Left" Urgency',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        heading: 'Hurry! Low Stock',
        subheading: 'Only a few units left in stock. Order now before it sells out.',
        ctaText: 'Add to Cart',
        ctaUrl: 'https://example.com/cart',
        enableAnimation: true,
      },
      placement: { enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight' },
        typography: { size: 'MD', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#ffffff', background: '#b91c1c', buttonBg: '#ffffff', buttonText: '#b91c1c' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'md' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    } as RecipeSpec,
  },

  // CUX-036: Cart Analytics Signals
  {
    id: 'CUX-036',
    name: 'Cart Analytics Signals',
    description: 'Web pixel tracking cart views and add-to-cart events for analytics.',
    category: 'INTEGRATION',
    type: 'analytics.pixel',
    icon: 'analytics',
    tags: ['analytics', 'cart', 'tracking'],
    spec: {
      type: 'analytics.pixel',
      name: 'Cart Analytics Signals',
      category: 'INTEGRATION',
      requires: [],
      config: {
        events: ['cart_viewed', 'product_added_to_cart'],
      },
    } as RecipeSpec,
  },
];

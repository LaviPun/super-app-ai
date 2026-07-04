import type { TemplateEntry } from '../types.js';

/**
 * admin.discountUi — Spring-2026 Discount UI Extension templates.
 *
 * Surface: `admin.discount-details.function-settings.render` — the settings form the
 * merchant sees on a discount's detail page, paired with a `functions.discountRules`
 * Function that enforces the price change at checkout. The extension is DECLARATIVE:
 * it renders `config.fields[]` (text / number / toggle / select) into the discount
 * admin and persists their values; the paired Function reads them. These four are
 * grounded in the real discount-configuration UIs of Discount Ninja, Ultimate Special
 * Offers, Bold Discounts (Flash Sales), and Kaching Bundles — each app's offer editor
 * distilled to the admin knobs the surface can actually render.
 *
 * Honesty: `admin.discountUi` compiles AUDIT-only today (typed payload + metaobject, no
 * deployable ui-extension bundle) and its price enforcement lives in the paired
 * discount Function — nothing here implies a live checkout effect on its own. Fields
 * use ONLY the schema's `kind` union; `discountClass` uses ONLY product|order|shipping.
 */
export const ADMIN_DISCOUNT_UI_SETTINGS_TEMPLATES: TemplateEntry[] = [
  {
    // Grounded in Discount Ninja Promo Engine (discount-ninja.md): order-level
    // "Spend-to-Save Tiers" — buy-more-save-more up to 5 tiers, audience/geo gating,
    // stacking, schedule. Order discount class; the tier rows + gates are the knobs.
    id: 'ADUI-01',
    name: 'Discount Ninja — Spend-to-Save Tiers',
    description:
      'Order-level tiered promotion settings (buy-more-save-more) on the discount detail page, paired with an order discount Function — Discount Ninja style.',
    category: 'ADMIN_UI',
    type: 'admin.discountUi',
    icon: 'discount',
    tags: ['discount-ninja', 'discounts', 'tiered', 'spend-to-save', 'admin', 'order'],
    spec: {
      type: 'admin.discountUi',
      name: 'Discount Ninja — Spend-to-Save Tiers',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        title: 'Spend-to-Save Tiers',
        discountClass: 'order',
        functionHandle: 'superapp-order-discount',
        description:
          'Reward higher cart totals with escalating savings. Add up to five tiers (spend threshold → discount) and gate the promotion by audience, customer tag, or country.',
        fields: [
          { key: 'promotionName', label: 'Promotion name', kind: 'text' },
          { key: 'tier1Threshold', label: 'Tier 1 — spend at least', kind: 'number' },
          { key: 'tier1Percentage', label: 'Tier 1 — % off order', kind: 'number' },
          { key: 'tier2Threshold', label: 'Tier 2 — spend at least', kind: 'number' },
          { key: 'tier2Percentage', label: 'Tier 2 — % off order', kind: 'number' },
          { key: 'tier3Threshold', label: 'Tier 3 — spend at least', kind: 'number' },
          { key: 'tier3Percentage', label: 'Tier 3 — % off order', kind: 'number' },
          { key: 'audience', label: 'Eligible shoppers', kind: 'select' },
          { key: 'customerTag', label: 'Restrict to customer tag', kind: 'text' },
          { key: 'combineWithCodes', label: 'Combine with other discount codes', kind: 'toggle' },
        ],
      },
    },
  },
  {
    // Grounded in Ultimate Special Offers (ultimate-special-offers.md): the Offer editor
    // for a BOGO / free-gift offer — trigger set, trigger quantity, reward, discount kind
    // (new price / percentage / amount), account-gating and tag eligibility, offer limit.
    id: 'ADUI-02',
    name: 'Ultimate Special Offers — BOGO & Free Gift',
    description:
      'Product discount settings for a Buy-X-Get-Y / free-gift offer on the discount detail page, paired with a product discount Function — Ultimate Special Offers style.',
    category: 'ADMIN_UI',
    type: 'admin.discountUi',
    icon: 'discount',
    tags: ['ultimate-special-offers', 'discounts', 'bogo', 'free-gift', 'admin', 'product'],
    spec: {
      type: 'admin.discountUi',
      name: 'Ultimate Special Offers — BOGO & Free Gift',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        title: 'Buy X, Get Y Offer',
        discountClass: 'product',
        functionHandle: 'superapp-product-discount',
        description:
          'Configure a Buy-X-Get-Y or free-gift offer: pick the trigger products and quantity, the reward, and the discount applied — new price, percentage, or amount off.',
        fields: [
          { key: 'offerName', label: 'Offer name', kind: 'text' },
          { key: 'triggerCollection', label: 'Buy from collection', kind: 'select' },
          { key: 'triggerQuantity', label: 'Buy quantity', kind: 'number' },
          { key: 'rewardCollection', label: 'Get from collection', kind: 'select' },
          { key: 'discountKind', label: 'Reward type', kind: 'select' },
          { key: 'discountValue', label: 'Discount value', kind: 'number' },
          { key: 'offerLimit', label: 'Max redemptions per order', kind: 'number' },
          { key: 'accountRequired', label: 'Signed-in customers only', kind: 'toggle' },
          { key: 'eligibleTag', label: 'Eligible customer tag', kind: 'text' },
        ],
      },
    },
  },
  {
    // Grounded in Bold Discounts — Flash Sales (bold-discounts.md): the "discount group"
    // editor — percentage vs dollar amount, override-cents (.99 price ending), scheduled
    // start/end date range, discount tag stamped on members, storefront sale message.
    id: 'ADUI-03',
    name: 'Bold Discounts — Scheduled Flash Sale',
    description:
      'Product discount settings for a scheduled flash sale (percentage or amount, price-ending, date range) on the discount detail page, paired with a product discount Function — Bold Discounts style.',
    category: 'ADMIN_UI',
    type: 'admin.discountUi',
    icon: 'discount',
    tags: ['bold-discounts', 'discounts', 'flash-sale', 'scheduled', 'admin', 'product'],
    spec: {
      type: 'admin.discountUi',
      name: 'Bold Discounts — Scheduled Flash Sale',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        title: 'Flash Sale Group',
        discountClass: 'product',
        functionHandle: 'superapp-product-discount',
        description:
          'Put a group of products on sale for a fixed window. Choose a percentage or amount off, optionally force a price ending (e.g. .99), and set the start and end date the sale is live.',
        fields: [
          { key: 'saleName', label: 'Discount name', kind: 'text' },
          { key: 'discountType', label: 'Discount type', kind: 'select' },
          { key: 'discountAmount', label: 'Discount amount', kind: 'number' },
          { key: 'overrideCents', label: 'Force price ending (cents)', kind: 'number' },
          { key: 'targetCollection', label: 'Products on sale (collection)', kind: 'select' },
          { key: 'discountTag', label: 'Tag applied to sale products', kind: 'text' },
          { key: 'enableDateRange', label: 'Schedule start / end', kind: 'toggle' },
          { key: 'saleMessage', label: 'Storefront sale message', kind: 'text' },
        ],
      },
    },
  },
  {
    // Grounded in Kaching Bundles App & Upsells (kaching-bundles.md): the quantity-break /
    // volume-discount deal editor — per-tier quantity + discount kind (percent / flat /
    // specific price) + value, a highlighted "Most Popular" pre-selected tier, and free
    // shipping as an outcome. Product discount class; Functions-based (no coupon codes).
    id: 'ADUI-04',
    name: 'Kaching Bundles — Quantity Break Deal',
    description:
      'Product discount settings for a quantity-break / volume deal (per-tier quantity and discount, highlighted tier) on the discount detail page, paired with a product discount Function — Kaching Bundles style.',
    category: 'ADMIN_UI',
    type: 'admin.discountUi',
    icon: 'discount',
    tags: ['kaching-bundles', 'discounts', 'quantity-break', 'volume', 'admin', 'product'],
    spec: {
      type: 'admin.discountUi',
      name: 'Kaching Bundles — Quantity Break Deal',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        title: 'Quantity Break Deal',
        discountClass: 'product',
        functionHandle: 'superapp-product-discount',
        description:
          'Reward buying more of the same product with tiered savings. Set the quantity and discount for each break, highlight the best-value tier, and optionally unlock free shipping.',
        fields: [
          { key: 'dealName', label: 'Deal name', kind: 'text' },
          { key: 'discountKind', label: 'Discount type', kind: 'select' },
          { key: 'tier1Quantity', label: 'Tier 1 — quantity', kind: 'number' },
          { key: 'tier1Value', label: 'Tier 1 — discount', kind: 'number' },
          { key: 'tier2Quantity', label: 'Tier 2 — quantity', kind: 'number' },
          { key: 'tier2Value', label: 'Tier 2 — discount', kind: 'number' },
          { key: 'tier3Quantity', label: 'Tier 3 — quantity', kind: 'number' },
          { key: 'tier3Value', label: 'Tier 3 — discount', kind: 'number' },
          { key: 'highlightTier', label: 'Highlight best-value tier', kind: 'toggle' },
          { key: 'freeShipping', label: 'Unlock free shipping', kind: 'toggle' },
        ],
      },
    },
  },
];

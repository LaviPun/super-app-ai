import type { TemplateEntry } from '../types.js';

/**
 * Admin blocks for the product-variant-details page
 * (`admin.product-variant-details.block.render`).
 *
 * Each entry is an `admin.block` RecipeSpec whose declarative content
 * (`fields` / `badges` / `table` / `buttons` / `links`) is rendered by the shipped
 * generic admin UI extension (extensions/admin-ui) with Polaris `s-*` web components,
 * read from the persisted `$app:superapp_admin_block` metaobject.
 *
 * Grounded in the subscriptions + shipping corpus (appstle-subscriptions.md,
 * recharge.md, intuitive-shipping.md): all three are merchant control-plane apps whose
 * per-variant state (selling-plan config, subscriber metrics, shipping profile) is
 * exactly what a variant-details block surfaces in the admin.
 *
 * HONESTY NOTE: the numbers/rows below are illustrative example content for the block
 * template — the block renders whatever config is persisted at publish time; it does not
 * claim a guaranteed live data feed. The block is a real, deployable admin UI surface
 * (target ∈ ADMIN_BLOCK_TARGETS); its declarative content is byte-rendered as shown.
 */
export const ADMIN_BLOCK_VARIANT_DETAILS_TEMPLATES: TemplateEntry[] = [
  // ADMB-VAR-01 — Appstle-style: variant subscription plan status on the variant page.
  // Corpus: appstle-subscriptions.md §surfaces (admin.block plan builder / subscriber
  // management), §settings_taxonomy behavior (billing type, frequencies, discount,
  // min/max cycles), §functional_model SellingPlanGroup.
  {
    id: 'ADMB-VAR-01',
    name: 'Variant Subscription Plan Status',
    description:
      'Admin block on the product-variant page showing the selling plan attached to this variant — billing type, frequencies, save %, and active subscriber count.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['appstle', 'subscriptions', 'selling-plan', 'variant', 'admin', 'product'],
    spec: {
      type: 'admin.block',
      name: 'Variant Subscription Plan Status',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-variant-details.block.render',
        label: 'Subscription plan',
        description:
          'The selling plan and subscribe-and-save configuration applied to this variant.',
        badges: [
          { label: 'Subscribe & Save', tone: 'success' },
          { label: 'Pay-as-you-go', tone: 'info' },
        ],
        fields: [
          { label: 'Plan', value: 'Deliver & Save' },
          { label: 'Billing type', value: 'Pay-as-you-go' },
          { label: 'Frequencies', value: 'Every 2 / 4 / 8 weeks' },
          { label: 'Save', value: '15% off each order', tone: 'success' },
          { label: 'Min / max cycles', value: '1 / unlimited' },
          { label: 'Active subscribers', value: '312' },
        ],
        buttons: [{ label: 'Edit plan' }],
        links: [{ label: 'Open subscriber portal settings', url: 'shopify://admin/apps' }],
      },
    },
  },

  // ADMB-VAR-02 — Recharge-style: variant retention/subscription metrics on the variant page.
  // Corpus: recharge.md §surfaces (merchant portal config), §functional_model
  // Subscription/Charge (active count, next charge), §settings_taxonomy behavior
  // (plan type, interval, discount) + reviews_signal (retention metrics).
  {
    id: 'ADMB-VAR-02',
    name: 'Variant Subscription Metrics',
    description:
      'Admin block on the product-variant page reporting subscription performance for this variant — active subscribers, plan type, interval, and recent churn.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['recharge', 'subscriptions', 'retention', 'variant', 'admin', 'metrics'],
    spec: {
      type: 'admin.block',
      name: 'Variant Subscription Metrics',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-variant-details.block.render',
        label: 'Subscription metrics',
        description:
          'Active subscription performance for this variant, grouped by plan.',
        fields: [
          { label: 'Active subscribers', value: '184' },
          { label: 'Plan type', value: 'Subscribe & save' },
          { label: 'Interval', value: 'Every 1 month' },
          { label: 'Per-order discount', value: '10% off' },
          { label: 'Cancels (30d)', value: '7', tone: 'warning' },
        ],
        table: {
          columns: ['Plan', 'Subscribers', 'Status'],
          rows: [
            ['Monthly – 10% off', '129', 'Active'],
            ['Every 2 months – 12% off', '55', 'Active'],
            ['Legacy weekly', '0', 'Paused'],
          ],
        },
        buttons: [{ label: 'View subscriptions' }],
      },
    },
  },

  // ADMB-VAR-03 — Intuitive Shipping-style: variant shipping-profile readiness on the variant page.
  // Corpus: intuitive-shipping.md §data (per-product weight + dimensions required for
  // parcel/SmartBoxing/volume), §settings_taxonomy behavior (SmartBoxing packing),
  // §functional_model Box/Package. Flags missing weight/dimensions honestly.
  {
    id: 'ADMB-VAR-03',
    name: 'Variant Shipping Profile',
    description:
      'Admin block on the product-variant page showing shipping readiness for this variant — weight, dimensions, and whether SmartBoxing/volume rating can price it.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['intuitive-shipping', 'shipping', 'dimensions', 'variant', 'admin', 'smartboxing'],
    spec: {
      type: 'admin.block',
      name: 'Variant Shipping Profile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-variant-details.block.render',
        label: 'Shipping profile',
        description:
          'Weight and dimensions used by volume-based and SmartBoxing rate calculations for this variant.',
        badges: [{ label: 'Dimensions incomplete', tone: 'warning' }],
        fields: [
          { label: 'Weight', value: '0.45 kg' },
          { label: 'Dimensions (L×W×H)', value: 'Not set', tone: 'warning' },
          { label: 'Pack separately', value: 'No' },
          { label: 'SmartBoxing eligible', value: 'Needs dimensions', tone: 'warning' },
        ],
        table: {
          columns: ['Rate method', 'Uses', 'Ready'],
          rows: [
            ['Weight-based', 'Weight', 'Yes'],
            ['Volume-based', 'Dimensions', 'No'],
            ['SmartBoxing', 'Dimensions', 'No'],
          ],
        },
        buttons: [{ label: 'Set dimensions' }],
      },
    },
  },
];

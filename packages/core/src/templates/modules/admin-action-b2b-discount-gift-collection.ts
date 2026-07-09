import type { TemplateEntry } from '../types.js';

/**
 * ADMA-B2B — admin.action templates for the B2B / wholesale, discount, gift-card and
 * collection admin surfaces. Grounded in the corpus B2B-pricing + discount + loyalty
 * records (bold-custom-pricing, bold-discounts, discount-ninja, ultimate-special-offers,
 * bold-memberships, smile-io, loyaltylion) — each of those apps lives primarily in the
 * embedded admin, where merchants configure customer-group pricing, quantity breaks,
 * discount stacking, and gift/reward issuance. These templates surface those workflows as
 * declarative admin action-modal entries: every entry is a `admin.action` RecipeSpec whose
 * `config.target` is a real ADMIN_ACTION_TARGETS value and whose modal content uses only the
 * declarative AdminContentShape vocab (description/fields/badges/table/buttons/links). All
 * link URLs are relative app deep-links; nothing here implies a guaranteed-live external send.
 */
export const ADMA_B2B_TEMPLATES: TemplateEntry[] = [
  {
    id: 'ADMA-B2B-01',
    name: 'Wholesale Pricing Group — Collection',
    description: 'Collection details action that applies a customer-tag wholesale pricing group with quantity breaks to every product in the collection.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'wholesale', 'pricing', 'collection', 'quantity-breaks'],
    spec: {
      type: 'admin.action',
      name: 'Wholesale Pricing Group — Collection',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.collection-details.action.render',
        label: 'Apply wholesale pricing group',
        title: 'Wholesale pricing for this collection',
        description: 'Assign a customer-group discount and quantity-break tiers to every product in this collection. Tagged wholesale customers see their price; retail customers are unaffected.',
        fields: [
          { label: 'Pricing group', value: 'Wholesale — Tier A', tone: 'info' },
          { label: 'Customer tag', value: 'wholesale' },
          { label: 'Discount type', value: 'Percent off (%)' },
          { label: 'Quantity breaks', value: '10 / 50 / 100 units' },
        ],
        badges: [
          { label: 'B2B', tone: 'info' },
          { label: 'Tag-gated', tone: 'neutral' },
        ],
        buttons: [
          { label: 'Configure pricing group', url: '/app/b2b/pricing-groups/new' },
        ],
        links: [
          { label: 'Manage customer tags', url: '/app/b2b/tags' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-02',
    name: 'Bulk Wholesale Tag — Collections',
    description: 'Collection index selection action that assigns a shared wholesale pricing group across every selected collection in one pass.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'wholesale', 'collection', 'bulk'],
    spec: {
      type: 'admin.action',
      name: 'Bulk Wholesale Tag — Collections',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.collection-index.action.render',
        label: 'Bulk-apply wholesale pricing',
        title: 'Apply wholesale pricing to selected collections',
        description: 'Assign the same customer-group pricing rule set to a batch of collections at once, so B2B pricing stays consistent across your catalog.',
        fields: [
          { label: 'Rule set', value: 'Wholesale — Standard' },
          { label: 'Applies to', value: 'Selected collections' },
        ],
        badges: [{ label: 'Bulk', tone: 'info' }],
        buttons: [
          { label: 'Choose pricing rule set', url: '/app/b2b/pricing-groups' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-03',
    name: 'Company Pricing Profile',
    description: 'Company details action that reviews and edits the B2B pricing profile, payment terms, and catalog assigned to a wholesale company.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'company', 'wholesale', 'net-terms'],
    spec: {
      type: 'admin.action',
      name: 'Company Pricing Profile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.company-details.action.render',
        label: 'Edit B2B pricing profile',
        title: 'B2B pricing profile',
        description: 'Review the pricing group, catalog, and payment terms assigned to this company. Locations inherit the profile unless overridden.',
        fields: [
          { label: 'Pricing group', value: 'Wholesale — Tier B', tone: 'info' },
          { label: 'Payment terms', value: 'Net 30' },
          { label: 'Catalog', value: 'B2B catalog' },
          { label: 'Tax status', value: 'Tax-exempt', tone: 'warning' },
        ],
        badges: [
          { label: 'Company', tone: 'info' },
          { label: 'Net 30', tone: 'neutral' },
        ],
        table: {
          columns: ['Location', 'Pricing group', 'Terms'],
          rows: [
            ['HQ Warehouse', 'Wholesale — Tier B', 'Net 30'],
            ['West Coast DC', 'Wholesale — Tier B', 'Net 30'],
          ],
        },
        links: [
          { label: 'Open company settings', url: '/app/b2b/companies' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-04',
    name: 'Convert Draft to Wholesale Order',
    description: 'Draft order details action that re-prices a draft against the customer’s wholesale group and applies negotiated quantity-break totals.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'draft-order', 'wholesale', 'pricing'],
    spec: {
      type: 'admin.action',
      name: 'Convert Draft to Wholesale Order',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.draft-order-details.action.render',
        label: 'Re-price at wholesale',
        title: 'Apply wholesale pricing to this draft',
        description: 'Re-price the draft order line items against the customer’s wholesale pricing group and quantity breaks, then send the updated invoice.',
        fields: [
          { label: 'Customer tag', value: 'wholesale' },
          { label: 'Pricing group', value: 'Wholesale — Tier A', tone: 'info' },
          { label: 'Terms', value: 'Net 30' },
        ],
        badges: [{ label: 'B2B', tone: 'info' }],
        buttons: [
          { label: 'Re-price and send invoice', url: '/app/b2b/draft-orders/reprice' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-05',
    name: 'Bulk Wholesale Draft Re-price',
    description: 'Draft order index selection action that applies wholesale pricing groups to a batch of open drafts before sending invoices.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'draft-order', 'bulk', 'wholesale'],
    spec: {
      type: 'admin.action',
      name: 'Bulk Wholesale Draft Re-price',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.draft-order-index.selection-action.render',
        label: 'Re-price selected drafts',
        title: 'Re-price selected drafts at wholesale',
        description: 'Apply each customer’s wholesale pricing group to the selected draft orders in one pass. Drafts without a wholesale-tagged customer are skipped.',
        fields: [
          { label: 'Scope', value: 'Selected drafts' },
          { label: 'Rule', value: 'Per-customer wholesale group' },
        ],
        badges: [{ label: 'Bulk', tone: 'info' }],
        buttons: [
          { label: 'Re-price drafts', url: '/app/b2b/draft-orders/bulk-reprice' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-06',
    name: 'New Wholesale Draft',
    description: 'Draft order index action that starts a new draft pre-scoped to a wholesale company and its negotiated pricing group.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'draft-order', 'company', 'wholesale'],
    spec: {
      type: 'admin.action',
      name: 'New Wholesale Draft',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.draft-order-index.action.render',
        label: 'New wholesale draft',
        title: 'Start a wholesale draft order',
        description: 'Create a draft pre-scoped to a wholesale company so line items price against its pricing group and payment terms automatically.',
        fields: [
          { label: 'For', value: 'Wholesale company' },
          { label: 'Pricing', value: 'Company pricing group' },
        ],
        buttons: [
          { label: 'Choose company', url: '/app/b2b/companies' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-07',
    name: 'Recover Cart with Wholesale Quote',
    description: 'Abandoned checkout action that re-issues the cart as a wholesale-priced draft quote for a tagged B2B buyer.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'abandoned-checkout', 'wholesale', 'recovery'],
    spec: {
      type: 'admin.action',
      name: 'Recover Cart with Wholesale Quote',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.abandoned-checkout-details.action.render',
        label: 'Send wholesale quote',
        title: 'Recover with a wholesale quote',
        description: 'Turn this abandoned checkout into a draft quote priced against the buyer’s wholesale group, then send it for approval.',
        fields: [
          { label: 'Customer', value: 'Wholesale-tagged buyer' },
          { label: 'Pricing group', value: 'Wholesale — Tier A', tone: 'info' },
        ],
        badges: [{ label: 'Recovery', tone: 'warning' }],
        buttons: [
          { label: 'Create wholesale quote', url: '/app/b2b/quotes/from-checkout' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-08',
    name: 'Discount Stacking Rules',
    description: 'Discount details action that reviews how this discount combines with automatic, code, and wholesale pricing on the same order.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'discount', 'stacking', 'b2b', 'combine'],
    spec: {
      type: 'admin.action',
      name: 'Discount Stacking Rules',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.discount-details.action.render',
        label: 'Review stacking rules',
        title: 'How this discount combines',
        description: 'See which other discounts this one stacks with and confirm it plays correctly alongside wholesale pricing groups at checkout.',
        fields: [
          { label: 'Combines with product discounts', value: 'Yes', tone: 'success' },
          { label: 'Combines with order discounts', value: 'No', tone: 'critical' },
          { label: 'Combines with shipping discounts', value: 'Yes', tone: 'success' },
        ],
        badges: [
          { label: 'Combinable', tone: 'success' },
        ],
        table: {
          columns: ['Layer', 'Combines', 'Priority'],
          rows: [
            ['Wholesale group', 'Yes', 'First'],
            ['Automatic order', 'No', '—'],
            ['Code (shipping)', 'Yes', 'Last'],
          ],
        },
        links: [
          { label: 'Edit combination settings', url: '/app/discounts/combinations' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-09',
    name: 'Quantity-Break Discount',
    description: 'Discount index action that creates a tiered volume discount whose thresholds mirror the store’s wholesale quantity breaks.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'discount', 'volume', 'quantity-breaks', 'b2b'],
    spec: {
      type: 'admin.action',
      name: 'Quantity-Break Discount',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.discount-index.action.render',
        label: 'New volume discount',
        title: 'Create a quantity-break discount',
        description: 'Build a tiered discount that steps down price as cart quantity crosses each break — matching the volume tiers your wholesale buyers already expect.',
        fields: [
          { label: 'Model', value: 'Tiered by quantity' },
          { label: 'Tiers', value: '10 / 50 / 100 units' },
        ],
        badges: [{ label: 'Volume', tone: 'info' }],
        buttons: [
          { label: 'Configure tiers', url: '/app/discounts/volume/new' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-10',
    name: 'Bulk Archive Discounts',
    description: 'Discount index selection action that archives a batch of expired or superseded promotions to keep the discount list clean.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'discount', 'bulk', 'archive', 'ops'],
    spec: {
      type: 'admin.action',
      name: 'Bulk Archive Discounts',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.discount-index.action.render',
        label: 'Archive selected discounts',
        title: 'Archive selected discounts',
        description: 'Deactivate and archive the selected promotions in one action so only live offers remain in the active list.',
        fields: [
          { label: 'Scope', value: 'Selected discounts' },
          { label: 'After archive', value: 'Removed from checkout' },
        ],
        badges: [{ label: 'Cleanup', tone: 'warning' }],
        buttons: [
          { label: 'Archive', url: '/app/discounts/archive', tone: 'critical' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-11',
    name: 'Reissue Gift Card',
    description: 'Gift card details action that reviews balance and expiry, then reissues or tops up the card for a wholesale or VIP customer.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'gift-card', 'reissue', 'balance', 'vip'],
    spec: {
      type: 'admin.action',
      name: 'Reissue Gift Card',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.gift-card-details.action.render',
        label: 'Reissue or top up',
        title: 'Gift card management',
        description: 'Review this card’s balance and expiry, then reissue a replacement or add store credit for the customer.',
        fields: [
          { label: 'Balance', value: '$45.00', tone: 'info' },
          { label: 'Status', value: 'Active', tone: 'success' },
          { label: 'Expires', value: 'No expiry' },
        ],
        badges: [
          { label: 'Store credit', tone: 'info' },
        ],
        buttons: [
          { label: 'Top up balance', url: '/app/gift-cards/topup' },
          { label: 'Reissue card', url: '/app/gift-cards/reissue' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-12',
    name: 'Issue Reward Gift Card',
    description: 'Customer details action that issues a loyalty reward or wholesale incentive as a store-credit gift card to the customer.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'gift-card', 'loyalty', 'reward', 'customer'],
    spec: {
      type: 'admin.action',
      name: 'Issue Reward Gift Card',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-details.action.render',
        label: 'Issue reward card',
        title: 'Issue a reward gift card',
        description: 'Grant a loyalty reward or wholesale incentive as a store-credit gift card. The amount is applied at checkout like any Shopify gift card.',
        fields: [
          { label: 'Reward tier', value: 'Loyalty — Gold', tone: 'info' },
          { label: 'Suggested amount', value: '$25.00' },
        ],
        badges: [
          { label: 'Loyalty', tone: 'success' },
        ],
        buttons: [
          { label: 'Issue gift card', url: '/app/loyalty/rewards/gift-card' },
        ],
        links: [
          { label: 'View loyalty profile', url: '/app/loyalty/customers' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-13',
    name: 'Bulk Tag Wholesale Customers',
    description: 'Customer index selection action that applies a wholesale customer tag to a batch of accounts so B2B pricing resolves for them.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'customer', 'tag', 'bulk'],
    spec: {
      type: 'admin.action',
      name: 'Bulk Tag Wholesale Customers',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.customer-index.selection-action.render',
        label: 'Tag as wholesale',
        title: 'Tag selected customers as wholesale',
        description: 'Apply the wholesale customer tag to the selected accounts. Tagged customers immediately resolve to their pricing group on the storefront and at checkout.',
        fields: [
          { label: 'Tag to apply', value: 'wholesale' },
          { label: 'Pricing group', value: 'Wholesale — Standard', tone: 'info' },
        ],
        badges: [{ label: 'B2B', tone: 'info' }],
        buttons: [
          { label: 'Apply tag', url: '/app/b2b/tags/apply' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-14',
    name: 'Wholesale Purchase Option',
    description: 'Product purchase-option action that attaches a case-pack / minimum-order-quantity purchase option scoped to wholesale buyers.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'purchase-option', 'moq', 'wholesale'],
    spec: {
      type: 'admin.action',
      name: 'Wholesale Purchase Option',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-purchase-option.action.render',
        label: 'Add wholesale purchase option',
        title: 'Wholesale case-pack option',
        description: 'Offer a case-pack or minimum-order-quantity purchase option for this product, shown to wholesale-tagged buyers alongside the retail option.',
        fields: [
          { label: 'Option', value: 'Case pack (12)' },
          { label: 'Minimum order', value: '2 cases' },
          { label: 'Audience', value: 'Wholesale tag', tone: 'info' },
        ],
        badges: [{ label: 'B2B', tone: 'info' }],
        buttons: [
          { label: 'Configure purchase option', url: '/app/b2b/purchase-options/new' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-15',
    name: 'Variant Volume Tiers',
    description: 'Product variant purchase-option action that sets per-variant volume-pricing tiers for wholesale buyers on a specific SKU.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'b2b', 'purchase-option', 'variant', 'volume'],
    spec: {
      type: 'admin.action',
      name: 'Variant Volume Tiers',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-variant-purchase-option.action.render',
        label: 'Set variant volume tiers',
        title: 'Volume pricing for this variant',
        description: 'Define per-variant quantity-break tiers so this SKU prices down as wholesale buyers add more units.',
        fields: [
          { label: 'Variant', value: 'This SKU' },
          { label: 'Tiers', value: '10 / 25 / 50 units' },
        ],
        badges: [{ label: 'Volume', tone: 'info' }],
        table: {
          columns: ['Min qty', 'Price type', 'Value'],
          rows: [
            ['10', 'Percent off', '10%'],
            ['25', 'Percent off', '15%'],
            ['50', 'Fixed price', '$8.00'],
          ],
        },
        buttons: [
          { label: 'Edit tiers', url: '/app/b2b/purchase-options/tiers' },
        ],
      },
    },
  },
  {
    id: 'ADMA-B2B-16',
    name: 'Collection Gift-with-Purchase',
    description: 'Collection details action that configures an automatic gift-with-purchase offer triggered by items from this collection.',
    category: 'ADMIN_UI',
    type: 'admin.action',
    icon: 'admin',
    tags: ['admin', 'gift', 'gwp', 'collection', 'promotion'],
    spec: {
      type: 'admin.action',
      name: 'Collection Gift-with-Purchase',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.collection-details.action.render',
        label: 'Set up gift-with-purchase',
        title: 'Gift-with-purchase for this collection',
        description: 'Add a free gift automatically when the cart contains items from this collection above a spend threshold. Runs as a free-gift discount at checkout.',
        fields: [
          { label: 'Trigger', value: 'Items from this collection' },
          { label: 'Threshold', value: 'Spend $75+' },
          { label: 'Gift', value: 'Free sample product' },
        ],
        badges: [
          { label: 'GWP', tone: 'success' },
        ],
        buttons: [
          { label: 'Configure gift offer', url: '/app/discounts/gift-with-purchase/new' },
        ],
        links: [
          { label: 'Choose gift product', url: '/app/discounts/gifts' },
        ],
      },
    },
  },
];

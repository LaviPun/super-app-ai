import type { TemplateEntry } from '../types.js';

/**
 * admin.block templates — B2B + resource-details blocks.
 *
 * Surface focus: the resource-details admin block targets that DON'T get an
 * everyday customer/product/order block — the B2B pair (company / company-location),
 * merchandising (collection / catalog), and the order-adjacent trio (draft-order /
 * abandoned-checkout / gift-card). Every entry is a purely declarative
 * `admin.block` rendered by the shipped generic admin UI extension
 * (extensions/admin-ui) using Polaris `s-*` components — description, label/value
 * fields, badges, a small table, buttons, and links. No runtime bundle.
 *
 * Grounding: B2B/wholesale pricing (Bold "Custom Pricing: Wholesale B2B") and
 * memberships (Bold Memberships) for the company/location price-tier + entitlement
 * surfaces; Intuitive Shipping for the shipping-eligibility read-out; LoyaltyLion /
 * Smile.io for the gift-card-as-reward angle; boost-ai-search / search-discovery for
 * the collection/catalog merchandising read-out.
 *
 * HONESTY: an admin block only DISPLAYS config the merchant published + static rows
 * — it does not (and these templates never imply it does) live-query Shopify or a
 * third-party app. `fields`/`badges`/`table` values are illustrative defaults the
 * merchant edits; the `links`/`buttons` deep-link into the app to where the real
 * data is managed. Nothing here promises a guaranteed-live figure.
 */
export const ADMIN_BLOCK_B2B_AND_RESOURCE_TEMPLATES: TemplateEntry[] = [
  // ── Company (B2B) ─────────────────────────────────────────────────────────
  {
    id: 'ADMB-B2B-01',
    name: 'B2B Company Account Summary',
    description: 'Company-details block summarizing the wholesale account — assigned price tier, payment terms, and credit status for a B2B buyer org.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'b2b', 'company', 'wholesale', 'pricing', 'bold-custom-pricing'],
    spec: {
      type: 'admin.block',
      name: 'B2B Company Account Summary',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.company-details.block.render',
        label: 'Wholesale account',
        description: 'Wholesale pricing and terms assigned to this company. Edit tiers and terms in the app.',
        fields: [
          { label: 'Price tier', value: 'Wholesale — Tier 2', tone: 'info' },
          { label: 'Payment terms', value: 'Net 30' },
          { label: 'Credit status', value: 'In good standing', tone: 'success' },
          { label: 'Assigned tag', value: 'wholesale-tier-2' },
        ],
        badges: [
          { label: 'B2B', tone: 'info' },
          { label: 'Tax-exempt', tone: 'neutral' },
        ],
        links: [
          { label: 'Manage pricing group', url: '/app/b2b/pricing-groups' },
          { label: 'Edit payment terms', url: '/app/b2b/terms' },
        ],
      },
    },
  },
  {
    id: 'ADMB-B2B-02',
    name: 'Company Quantity-Break Matrix',
    description: 'Company-details block showing the quantity-break price ladder that applies to this wholesale account across its assigned catalog.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'b2b', 'company', 'quantity-breaks', 'wholesale', 'bold-custom-pricing'],
    spec: {
      type: 'admin.block',
      name: 'Company Quantity-Break Matrix',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.company-details.block.render',
        label: 'Quantity breaks',
        description: 'Volume price ladder resolved for this company. Managed as a pricing group in the app.',
        table: {
          columns: ['Min qty', 'Discount', 'Effective tier'],
          rows: [
            ['1–9', '0%', 'Wholesale base'],
            ['10–49', '5%', 'Tier 1'],
            ['50–199', '10%', 'Tier 2'],
            ['200+', '15%', 'Tier 3'],
          ],
        },
        buttons: [{ label: 'Open pricing group', url: '/app/b2b/pricing-groups' }],
      },
    },
  },
  {
    id: 'ADMB-B2B-03',
    name: 'Company Membership & Entitlements',
    description: 'Company-details block listing the active membership plan and the entitlements it unlocks for the buyer organization.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'b2b', 'company', 'membership', 'entitlements', 'bold-memberships'],
    spec: {
      type: 'admin.block',
      name: 'Company Membership & Entitlements',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.company-details.block.render',
        label: 'Membership',
        description: 'Membership plan and unlocked benefits for this company.',
        fields: [
          { label: 'Plan', value: 'Trade Pro (annual)', tone: 'info' },
          { label: 'Status', value: 'Active', tone: 'success' },
          { label: 'Renews', value: '2027-01-15' },
        ],
        badges: [
          { label: 'Members-only catalog', tone: 'info' },
          { label: 'Free freight', tone: 'success' },
        ],
        links: [{ label: 'Manage membership', url: '/app/memberships/plans' }],
      },
    },
  },

  // ── Company location (B2B) ────────────────────────────────────────────────
  {
    id: 'ADMB-B2B-04',
    name: 'Location Shipping & Freight Terms',
    description: 'Company-location-details block reading out the freight terms and delivery eligibility resolved for this specific ship-to location.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'b2b', 'company-location', 'shipping', 'freight', 'intuitive-shipping'],
    spec: {
      type: 'admin.block',
      name: 'Location Shipping & Freight Terms',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.company-location-details.block.render',
        label: 'Shipping terms',
        description: 'Freight and delivery rules that apply when this location is the ship-to. Configured as shipping scenarios in the app.',
        fields: [
          { label: 'Freight terms', value: 'FOB destination' },
          { label: 'Delivery method', value: 'LTL freight', tone: 'info' },
          { label: 'Free-freight threshold', value: '$2,500 subtotal' },
          { label: 'Liftgate required', value: 'Yes', tone: 'warning' },
        ],
        badges: [{ label: 'Freight zone A', tone: 'neutral' }],
        links: [{ label: 'Edit shipping scenario', url: '/app/shipping/scenarios' }],
      },
    },
  },
  {
    id: 'ADMB-B2B-05',
    name: 'Location Price List & Catalog',
    description: 'Company-location-details block showing which price list and assigned catalog govern orders placed for this location.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'b2b', 'company-location', 'price-list', 'catalog', 'bold-custom-pricing'],
    spec: {
      type: 'admin.block',
      name: 'Location Price List & Catalog',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.company-location-details.block.render',
        label: 'Price list & catalog',
        description: 'The wholesale price list and product catalog assigned to this location.',
        fields: [
          { label: 'Price list', value: 'Wholesale USD — West', tone: 'info' },
          { label: 'Catalog', value: 'Trade catalog (2026)' },
          { label: 'Currency', value: 'USD' },
          { label: 'Ordering', value: 'Open', tone: 'success' },
        ],
        buttons: [
          { label: 'Open price list', url: '/app/b2b/price-lists' },
          { label: 'Open catalog', url: '/app/catalogs' },
        ],
      },
    },
  },

  // ── Catalog (merchandising) ───────────────────────────────────────────────
  {
    id: 'ADMB-B2B-06',
    name: 'Catalog Publication & Coverage',
    description: 'Catalog-details block summarizing which companies a B2B catalog is published to and how many products and price-list rows it carries.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'catalog', 'b2b', 'publication', 'coverage', 'bold-custom-pricing'],
    spec: {
      type: 'admin.block',
      name: 'Catalog Publication & Coverage',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.catalog-details.block.render',
        label: 'Publication',
        description: 'Where this catalog is published and what it covers. Maintained in the app.',
        fields: [
          { label: 'Published to', value: '12 companies' },
          { label: 'Products', value: '1,480' },
          { label: 'Price-list rows', value: '3,920' },
          { label: 'Status', value: 'Published', tone: 'success' },
        ],
        badges: [{ label: 'B2B catalog', tone: 'info' }],
        links: [{ label: 'Manage catalog', url: '/app/catalogs' }],
      },
    },
  },
  {
    id: 'ADMB-B2B-07',
    name: 'Catalog Search & Merchandising Health',
    description: 'Catalog-details block reporting search indexing and merchandising coverage for the products in this catalog.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'catalog', 'search', 'merchandising', 'indexing', 'boost-ai-search'],
    spec: {
      type: 'admin.block',
      name: 'Catalog Search & Merchandising Health',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.catalog-details.block.render',
        label: 'Search & merchandising',
        description: 'Search-index and merchandising coverage for this catalog. Tune synonyms and boosts in the app.',
        table: {
          columns: ['Signal', 'Value'],
          rows: [
            ['Indexed products', '1,472 of 1,480'],
            ['Synonym sets', '86'],
            ['Boost rules', '14'],
            ['Redirects', '9'],
          ],
        },
        badges: [
          { label: '8 unindexed', tone: 'warning' },
        ],
        buttons: [{ label: 'Open search settings', url: '/app/search/config' }],
      },
    },
  },

  // ── Collection (merchandising) ────────────────────────────────────────────
  {
    id: 'ADMB-B2B-08',
    name: 'Collection Merchandising Rules',
    description: 'Collection-details block summarizing the automated sort, boost, and pin rules applied to a collection by the merchandising engine.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'collection', 'merchandising', 'sort', 'boost', 'boost-ai-search'],
    spec: {
      type: 'admin.block',
      name: 'Collection Merchandising Rules',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.collection-details.block.render',
        label: 'Merchandising',
        description: 'Automated sort and boost rules applied to this collection. Edit in the app.',
        fields: [
          { label: 'Default sort', value: 'Best sellers', tone: 'info' },
          { label: 'Out-of-stock', value: 'Pushed to bottom' },
          { label: 'Pinned products', value: '3' },
          { label: 'Boost rules', value: '2' },
        ],
        links: [
          { label: 'Edit sort & boosts', url: '/app/merchandising/collections' },
          { label: 'Manage pins', url: '/app/merchandising/pins' },
        ],
      },
    },
  },
  {
    id: 'ADMB-B2B-09',
    name: 'Collection B2B Visibility',
    description: 'Collection-details block showing which customer tags and companies can see and buy from this collection under B2B catalog scoping.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'collection', 'b2b', 'visibility', 'catalog', 'bold-memberships'],
    spec: {
      type: 'admin.block',
      name: 'Collection B2B Visibility',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.collection-details.block.render',
        label: 'B2B visibility',
        description: 'Who can see and buy from this collection. Scoped by catalog and customer tags in the app.',
        table: {
          columns: ['Audience', 'Access'],
          rows: [
            ['Retail (public)', 'Hidden'],
            ['wholesale-tier-1', 'Visible'],
            ['wholesale-tier-2', 'Visible'],
            ['members-trade-pro', 'Visible'],
          ],
        },
        badges: [{ label: 'Members-only', tone: 'info' }],
        buttons: [{ label: 'Edit visibility rules', url: '/app/b2b/catalog-scope' }],
      },
    },
  },

  // ── Draft order ───────────────────────────────────────────────────────────
  {
    id: 'ADMB-B2B-10',
    name: 'Draft Order Wholesale Pricing Audit',
    description: 'Draft-order-details block auditing which wholesale price rules and discounts were applied when this B2B draft order was built.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'draft-order', 'b2b', 'pricing', 'audit', 'bold-custom-pricing'],
    spec: {
      type: 'admin.block',
      name: 'Draft Order Wholesale Pricing Audit',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.draft-order-details.block.render',
        label: 'Pricing audit',
        description: 'Wholesale rules and terms captured on this draft order. Values reflect the published config; verify against the draft totals.',
        fields: [
          { label: 'Buyer tier', value: 'Wholesale — Tier 2', tone: 'info' },
          { label: 'Price list', value: 'Wholesale USD — West' },
          { label: 'Payment terms', value: 'Net 30' },
          { label: 'Quantity-break applied', value: 'Yes (50–199)', tone: 'success' },
        ],
        badges: [{ label: 'Tax-exempt', tone: 'neutral' }],
        links: [{ label: 'Review pricing group', url: '/app/b2b/pricing-groups' }],
      },
    },
  },

  // ── Abandoned checkout ────────────────────────────────────────────────────
  {
    id: 'ADMB-B2B-11',
    name: 'Abandoned Checkout Recovery Context',
    description: 'Abandoned-checkout-details block surfacing the buyer context and recovery status a merchant needs before following up on a stalled cart.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'abandoned-checkout', 'recovery', 'email', 'context', 'klaviyo'],
    spec: {
      type: 'admin.block',
      name: 'Abandoned Checkout Recovery Context',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.abandoned-checkout-details.block.render',
        label: 'Recovery context',
        description: 'Buyer context and recovery status for this abandoned checkout. Recovery flows are managed in the app.',
        fields: [
          { label: 'Buyer type', value: 'Wholesale (Tier 1)', tone: 'info' },
          { label: 'Recovery emails sent', value: '2 of 3' },
          { label: 'Discount offered', value: 'None' },
          { label: 'Last activity', value: '18 hours ago', tone: 'warning' },
        ],
        badges: [{ label: 'High value', tone: 'info' }],
        buttons: [{ label: 'Open recovery flow', url: '/app/flows/recovery' }],
      },
    },
  },

  // ── Gift card ─────────────────────────────────────────────────────────────
  {
    id: 'ADMB-B2B-12',
    name: 'Gift Card Reward Origin',
    description: 'Gift-card-details block explaining where a gift card came from — a loyalty reward, store credit, or manual issue — with its program context.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'admin',
    tags: ['admin', 'gift-card', 'loyalty', 'reward', 'store-credit', 'loyaltylion'],
    spec: {
      type: 'admin.block',
      name: 'Gift Card Reward Origin',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.gift-card-details.block.render',
        label: 'Reward origin',
        description: 'How this gift card was issued and the program it belongs to. Managed in the app.',
        fields: [
          { label: 'Source', value: 'Loyalty reward redemption', tone: 'info' },
          { label: 'Program', value: 'Rewards — Gold tier' },
          { label: 'Points spent', value: '2,500' },
          { label: 'Issued', value: 'Automatically on redemption', tone: 'success' },
        ],
        badges: [
          { label: 'Loyalty', tone: 'info' },
          { label: 'Non-refundable', tone: 'neutral' },
        ],
        links: [{ label: 'View loyalty program', url: '/app/loyalty/program' }],
      },
    },
  },
];

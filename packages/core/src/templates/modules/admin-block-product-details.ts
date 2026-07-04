import type { TemplateEntry } from '../types.js';

/**
 * ADMB-PRD — admin.block templates for `admin.product-details.block.render`.
 *
 * These are merchant-facing admin panels that appear on a product's details page
 * in the Shopify admin. They use the declarative `AdminContentShape` vocabulary
 * (description / fields / badges / table / buttons / links) that the shipped
 * generic admin UI extension (extensions/admin-ui) renders with Polaris `s-*`
 * web components from the persisted `$app:superapp_admin_block` metaobject.
 *
 * Grounding: the review/loyalty/shipping corpus apps (Judge.me, Loox, Okendo,
 * Intuitive Shipping) all run embedded admin surfaces whose PDP-side data —
 * aggregate rating + star distribution, review moderation queue, loyalty/points
 * mirrors, and shipping scenario/rate config — is a natural fit for a product
 * details block. Each panel below is a READ-VIEW of that app's own state; the
 * values shown are illustrative sample content the merchant edits per product.
 *
 * Honesty notes:
 *  - `admin.block` carries NO `requires` defaults and no live data binding — the
 *    fields/table/badges are declarative content persisted with the module, not a
 *    guaranteed live pull from an external review/loyalty/carrier service. Copy is
 *    written to read as "what this panel is FOR", not as a promise of live data.
 *  - `buttons[].url` / `links[].url` are relative app deep-links (the app owns the
 *    real moderation / rate-editor routes) or the vendor help resource — nothing
 *    implies a data feed that does not exist.
 */
export const ADMIN_BLOCK_PRODUCT_DETAILS_TEMPLATES: TemplateEntry[] = [
  {
    id: 'ADMB-PRD-01',
    name: 'Product Reviews Summary Panel',
    description:
      'Admin product-details block that surfaces this product\'s review aggregate — average rating, total count, verified share, and the 5-star distribution — for at-a-glance social-proof health.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'reviews',
    tags: ['reviews', 'admin', 'product', 'ratings', 'social-proof', 'judge-me'],
    spec: {
      type: 'admin.block',
      name: 'Product Reviews Summary Panel',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.block.render',
        label: 'Reviews summary',
        description:
          'Aggregate review health for this product. Numbers mirror the review app\'s corpus; open the moderation queue to reply to or curate individual reviews.',
        fields: [
          { label: 'Average rating', value: '4.7 / 5', tone: 'success' },
          { label: 'Total reviews', value: '312' },
          { label: 'Verified buyers', value: '87%', tone: 'info' },
          { label: 'Awaiting moderation', value: '4', tone: 'warning' },
          { label: 'With photo or video', value: '61%' },
        ],
        badges: [
          { label: 'Rich snippets on', tone: 'success' },
          { label: 'Auto-publish 4★+', tone: 'info' },
        ],
        table: {
          columns: ['Stars', 'Count', 'Share'],
          rows: [
            ['5', '241', '77%'],
            ['4', '46', '15%'],
            ['3', '14', '4%'],
            ['2', '6', '2%'],
            ['1', '5', '2%'],
          ],
        },
        buttons: [{ label: 'Open moderation queue', url: '/app/reviews/moderation' }],
        links: [{ label: 'Manage review widgets', url: '/app/reviews/widgets' }],
      },
    },
  },
  {
    id: 'ADMB-PRD-02',
    name: 'UGC Media & Q&A Panel',
    description:
      'Admin product-details block that reports collected photo/video review media and open Q&A for this product, so merchants can curate visual UGC and answer pending questions.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'gallery',
    tags: ['reviews', 'ugc', 'media', 'admin', 'product', 'loox'],
    spec: {
      type: 'admin.block',
      name: 'UGC Media & Q&A Panel',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.block.render',
        label: 'Media & Q&A',
        description:
          'Photo/video reviews and buyer questions gathered for this product. Feature standout media on the PDP and clear the pending-answer backlog.',
        fields: [
          { label: 'Photo reviews', value: '148' },
          { label: 'Video reviews', value: '23' },
          { label: 'Featured / pinned', value: '6', tone: 'info' },
          { label: 'Questions answered', value: '19 of 27' },
          { label: 'Questions pending', value: '8', tone: 'warning' },
        ],
        badges: [
          { label: 'Media gallery live', tone: 'success' },
          { label: 'Q&A widget on', tone: 'info' },
        ],
        buttons: [
          { label: 'Curate media gallery', url: '/app/reviews/media' },
          { label: 'Answer questions', url: '/app/reviews/questions' },
        ],
        links: [{ label: 'Product grouping settings', url: '/app/reviews/grouping' }],
      },
    },
  },
  {
    id: 'ADMB-PRD-03',
    name: 'Shipping Rules Panel',
    description:
      'Admin product-details block that shows which shipping scenarios, zones, and rate conditions apply to this product — package dimensions, weight, and any per-product shipping overrides.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'shipping',
    tags: ['shipping', 'admin', 'product', 'rates', 'rules', 'intuitive-shipping'],
    spec: {
      type: 'admin.block',
      name: 'Shipping Rules Panel',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.block.render',
        label: 'Shipping rules',
        description:
          'Shipping scenarios and rate conditions that match this product. Weight and dimensions drive volumetric and SmartBoxing calculations — keep them set for accurate checkout rates.',
        fields: [
          { label: 'Ship weight', value: '1.4 kg' },
          { label: 'Dimensions (L×W×H)', value: '30 × 20 × 8 cm' },
          { label: 'Pack separately', value: 'No' },
          { label: 'Free-shipping eligible', value: 'Over $75', tone: 'info' },
          { label: 'Missing dimensions', value: 'None', tone: 'success' },
        ],
        badges: [
          { label: 'In "Domestic Standard"', tone: 'info' },
          { label: 'Volumetric rating', tone: 'neutral' },
        ],
        table: {
          columns: ['Scenario', 'Zone', 'Method', 'Condition'],
          rows: [
            ['Domestic Standard', 'US 48', 'Ground', 'Cart total ≥ $0'],
            ['Domestic Express', 'US 48', '2-Day', 'Weight ≤ 5 kg'],
            ['International', 'CA / EU', 'Tracked', 'Excludes PO boxes'],
          ],
        },
        buttons: [{ label: 'Edit product shipping settings', url: '/app/shipping/product-settings' }],
        links: [{ label: 'Manage scenarios & zones', url: '/app/shipping/scenarios' }],
      },
    },
  },
  {
    id: 'ADMB-PRD-04',
    name: 'Loyalty & Rewards Panel',
    description:
      'Admin product-details block that reports how this product participates in the loyalty program — points-per-purchase, active earn rules, and reward/redemption eligibility.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'loyalty',
    tags: ['loyalty', 'rewards', 'admin', 'product', 'points', 'okendo'],
    spec: {
      type: 'admin.block',
      name: 'Loyalty & Rewards Panel',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.block.render',
        label: 'Loyalty & rewards',
        description:
          'How this product earns and redeems loyalty points. Values reflect the program\'s earn/redeem rules; adjust points-per-dollar or collection restrictions in the loyalty settings.',
        fields: [
          { label: 'Points per $1 spent', value: '5' },
          { label: 'Bonus for photo review', value: '+50 pts', tone: 'info' },
          { label: 'Redeemable on this product', value: 'Yes', tone: 'success' },
          { label: 'Collection restriction', value: 'None' },
          { label: 'Excluded from earning', value: 'No', tone: 'success' },
        ],
        badges: [
          { label: 'Earn rules active', tone: 'success' },
          { label: 'Store credit enabled', tone: 'info' },
        ],
        table: {
          columns: ['Earn rule', 'Points', 'Frequency'],
          rows: [
            ['Place an order', '5 / $1', 'Every order'],
            ['Write a review', '100', 'Once per product'],
            ['Add photo / video', '50', 'Once per review'],
          ],
        },
        buttons: [{ label: 'Edit earn & redeem rules', url: '/app/loyalty/rules' }],
        links: [{ label: 'Loyalty program settings', url: '/app/loyalty/settings' }],
      },
    },
  },
  {
    id: 'ADMB-PRD-05',
    name: 'Review Metafields Panel',
    description:
      'Admin product-details block that displays the standard review metafields mirrored onto this product — reviews.rating and reviews.rating_count — the values native theme elements and Google rich snippets read.',
    category: 'ADMIN_UI',
    type: 'admin.block',
    icon: 'metafields',
    tags: ['reviews', 'metafields', 'admin', 'product', 'seo', 'stamped'],
    spec: {
      type: 'admin.block',
      name: 'Review Metafields Panel',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.product-details.block.render',
        label: 'Review metafields',
        description:
          'Standard review metafields mirrored onto this product for native theme rendering and Google rich snippets. If a value looks stale, re-sync from the reviews app.',
        fields: [
          { label: 'reviews.rating', value: '4.7', tone: 'success' },
          { label: 'reviews.rating scale', value: '1.0 – 5.0' },
          { label: 'reviews.rating_count', value: '312' },
          { label: 'Last synced', value: '2 hours ago', tone: 'info' },
        ],
        badges: [
          { label: 'Rich snippets valid', tone: 'success' },
          { label: 'Standard namespace', tone: 'neutral' },
        ],
        table: {
          columns: ['Namespace', 'Key', 'Type', 'Value'],
          rows: [
            ['reviews', 'rating', 'rating', '4.7'],
            ['reviews', 'rating_count', 'number_integer', '312'],
          ],
        },
        buttons: [{ label: 'Re-sync metafields', url: '/app/reviews/metafields/sync' }],
        links: [{ label: 'View structured data', url: '/app/reviews/rich-snippets' }],
      },
    },
  },
];

export const templates: TemplateEntry[] = ADMIN_BLOCK_PRODUCT_DETAILS_TEMPLATES;

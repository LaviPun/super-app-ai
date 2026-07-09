// packages/core/src/templates/blocks/themeblock-collection-surface.ts
//
// theme.section app-block templates for the COLLECTION / SEARCH / LIST-COLLECTIONS
// surface (034 surface-coverage unit "collection-surface", floor 10). Every entry is a
// `theme.section` recipe placed via `enabled_on.templates ⊂ {collection, search,
// list-collections}` — the three placeable templates a faceted browse/results surface owns
// (allowed-values THEME_PLACEABLE_TEMPLATES).
//
// Grounding (028 corpus): faceted filter sidebar / horizontal filter bar / sort dropdown /
// "refine by" chips / result-count / product-count badges come from Boost AI Search & Filter
// (boost-ai-search.md settings_taxonomy → style/behavior) and Shopify Search & Discovery
// (shopify-search-discovery.md — filter source_type list, OR/AND logic, out-of-stock policy,
// complementary block). Promo banner / promotional badge / "add X more to unlock" copy come
// from Discount Ninja (discount-ninja.md — Promotional Badge on PLP/search, Product Banner)
// and Hextom Upsell Sales Boost (hextom-usb.md — collection sticker / promo message / trust
// + payment badges). Search "no-results" fallback + instant-search entry come from Boost's
// InstantSearchWidget config. Style objects use the six design-vocabulary style packs
// (design-vocabulary.md §4) layered over neutral defaults.
//
// HONESTY: these are app-BLOCK theme.section specs (deployable path per 034 §Deployability).
// Filter/sort/search DISPLAY chrome is what a self-contained theme module can own; the live
// index, synonyms, and query-time ranking that real Boost/S&D provide are out of scope for a
// single recipe (see each corpus mapping_note) — these render the surface, they do not host a
// search index. No invented targets/kinds/enums; `kind` is a free-form recommendation tag.

import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

type PlaceableTemplate = (typeof THEME_PLACEABLE_TEMPLATES)[number];

export const templates: TemplateEntry[] = [
  // TBLK-COL-01 — Faceted filter sidebar (Boost / Shopify Search & Discovery vertical sidebar).
  {
    id: 'TBLK-COL-01',
    name: 'Faceted Filter Sidebar',
    description: 'Vertical collapsible filter sidebar for collection and search pages — accordion facet groups (availability, price, type, vendor, size) with product counts.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'filter',
    tags: ['section', 'filters', 'faceted', 'collection', 'search', 'boost'],
    spec: {
      type: 'theme.section',
      name: 'Faceted Filter Sidebar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'filters',
        activation: 'section',
        title: 'Filter',
        subtitle: 'Refine your results',
        layout: { layout: 'stacked' },
        fields: {
          filterLayout: 'vertical-sidebar',
          optionSelect: 'multiple',
          showProductCount: true,
          showRefineByChips: true,
          collapseOnMobile: true,
          hideSingleValueOptions: true,
          outOfStockDisplay: 'placed-last',
          showMoreType: 'view-more',
        },
        blocks: [
          { kind: 'facet-group', text: 'Availability', fields: { source: 'availability', display: 'list', logic: 'OR', defaultOpen: true } },
          { kind: 'facet-group', text: 'Price', fields: { source: 'price', display: 'range-slider', logic: 'OR', defaultOpen: true } },
          { kind: 'facet-group', text: 'Product type', fields: { source: 'product-type', display: 'list', logic: 'OR', defaultOpen: false } },
          { kind: 'facet-group', text: 'Vendor', fields: { source: 'vendor', display: 'list', logic: 'OR', defaultOpen: false } },
          { kind: 'facet-group', text: 'Size', fields: { source: 'variant-option', optionName: 'Size', display: 'box', logic: 'AND', defaultOpen: false } },
        ],
      },
      placement: { enabled_on: { templates: ['collection', 'search'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'left', offsetX: 0, offsetY: 0, width: 'narrow', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#2563eb' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // TBLK-COL-02 — Horizontal filter bar + drawer (Boost horizontal / off-canvas layout).
  {
    id: 'TBLK-COL-02',
    name: 'Horizontal Filter Bar',
    description: 'Sticky horizontal filter bar above the product grid that opens an off-canvas drawer on mobile — compact facet pills with a result count.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'filter',
    tags: ['section', 'filters', 'horizontal', 'drawer', 'collection', 'boost'],
    spec: {
      type: 'theme.section',
      name: 'Horizontal Filter Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'filters',
        activation: 'section',
        title: 'Filter & sort',
        layout: { layout: 'stacked' },
        fields: {
          filterLayout: 'horizontal',
          mobileLayout: 'off-canvas-drawer',
          optionSelect: 'multiple',
          showResultCount: true,
          showRefineByChips: true,
          showLoadingIcon: true,
          stickyOnScroll: true,
        },
        blocks: [
          { kind: 'facet-pill', text: 'Availability', fields: { source: 'availability', display: 'list' } },
          { kind: 'facet-pill', text: 'Price', fields: { source: 'price', display: 'range-slider' } },
          { kind: 'facet-pill', text: 'Color', fields: { source: 'variant-option', optionName: 'Color', display: 'swatch' } },
          { kind: 'facet-pill', text: 'Brand', fields: { source: 'vendor', display: 'list' } },
        ],
      },
      placement: { enabled_on: { templates: ['collection', 'search'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'sticky', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'sticky' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.5 },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'sm', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
      },
    },
  },

  // TBLK-COL-03 — Sort dropdown / toolbar (Boost + S&D default sort orders).
  {
    id: 'TBLK-COL-03',
    name: 'Sort & Result Toolbar',
    description: 'Collection/search toolbar with a "Sort by" dropdown (relevance, price, newest, bestselling) plus a live result count and grid/list view toggle.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'sort',
    tags: ['section', 'sort', 'toolbar', 'collection', 'search', 'boost'],
    spec: {
      type: 'theme.section',
      name: 'Sort & Result Toolbar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'sort',
        activation: 'section',
        title: 'Sort by',
        layout: { layout: 'stacked' },
        fields: {
          showResultCount: true,
          showViewToggle: true,
          defaultSort: 'best-match',
          paginationType: 'load-more',
        },
        blocks: [
          { kind: 'sort-option', text: 'Best match', fields: { value: 'relevance', isDefault: true } },
          { kind: 'sort-option', text: 'Price: low to high', fields: { value: 'price-asc' } },
          { kind: 'sort-option', text: 'Price: high to low', fields: { value: 'price-desc' } },
          { kind: 'sort-option', text: 'Newest', fields: { value: 'created-desc' } },
          { kind: 'sort-option', text: 'Best selling', fields: { value: 'best-selling' } },
        ],
      },
      placement: { enabled_on: { templates: ['collection', 'search'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#2563eb' },
        shape: { radius: 'sm', borderWidth: 'none', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // TBLK-COL-04 — Collection promo banner (Discount Ninja product banner / Hextom promo message).
  {
    id: 'TBLK-COL-04',
    name: 'Collection Promo Banner',
    description: 'Full-width promo banner above the collection grid — sale headline, savings copy, and a CTA for flash sales and seasonal drops.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'banner',
    tags: ['section', 'promo', 'banner', 'sale', 'collection', 'discount-ninja'],
    spec: {
      type: 'theme.section',
      name: 'Collection Promo Banner',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'banner',
        activation: 'section',
        title: 'Mid-Season Sale',
        subtitle: 'Up to 40% off — ends Sunday',
        layout: { layout: 'stacked' },
        fields: {
          heading: 'Mid-Season Sale — up to 40% off',
          subheading: 'Discounts applied automatically at checkout. No code needed.',
          ctaText: 'Shop the sale',
          ctaUrl: 'https://example.com/collections/sale',
          dismissible: false,
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['collection', 'search'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#ffffff', background: '#111827', overlayBackdropOpacity: 0.5, seed: '#f5a623' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'md', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },

  // TBLK-COL-05 — Tiered free-shipping / spend-goal bar (Discount Ninja "add X more to unlock").
  {
    id: 'TBLK-COL-05',
    name: 'Spend-Goal Progress Bar',
    description: 'Slim progress bar above the grid nudging shoppers toward a free-shipping or spend-to-save threshold with "add X more to unlock" tier copy.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'progress',
    tags: ['section', 'promo', 'free-shipping', 'aov', 'collection', 'discount-ninja'],
    spec: {
      type: 'theme.section',
      name: 'Spend-Goal Progress Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'banner',
        activation: 'section',
        title: 'Free shipping goal',
        layout: { layout: 'stacked' },
        fields: {
          thresholdBasis: 'cart-value',
          preThresholdMessage: 'Add {{amount}} more to unlock free shipping',
          postThresholdMessage: "You've unlocked free shipping!",
          showProgressBar: true,
        },
        blocks: [
          { kind: 'tier', text: 'Free shipping', fields: { threshold: '75', reward: 'free-shipping' } },
          { kind: 'tier', text: 'Free gift', fields: { threshold: '120', reward: 'free-gift' } },
        ],
      },
      placement: { enabled_on: { templates: ['collection', 'search'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#16a34a' },
        shape: { radius: 'full', borderWidth: 'thin', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },

  // TBLK-COL-06 — Promotional badge overlay for PLP cards (Discount Ninja badge / Hextom sticker).
  {
    id: 'TBLK-COL-06',
    name: 'Product Card Badge Overlay',
    description: 'Corner sale/new/bestseller badges overlaid on collection and search product cards, driven by product tags for automatic per-item merchandising.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'badge',
    tags: ['section', 'badge', 'sticker', 'merchandising', 'collection', 'discount-ninja'],
    spec: {
      type: 'theme.section',
      name: 'Product Card Badge Overlay',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'badge',
        activation: 'overlay',
        title: 'Card badges',
        layout: { layout: 'stacked' },
        fields: {
          anchor: 'top-left',
          maxBadgesPerCard: 2,
          matchByTag: true,
        },
        blocks: [
          { kind: 'badge', text: 'Sale', fields: { tag: 'on-sale', tone: 'critical' } },
          { kind: 'badge', text: 'New', fields: { tag: 'new', tone: 'info' } },
          { kind: 'badge', text: 'Bestseller', fields: { tag: 'bestseller', tone: 'success' } },
        ],
      },
      placement: { enabled_on: { templates: ['collection', 'search'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'overlay', anchor: 'top', offsetX: 8, offsetY: 8, width: 'auto', zIndex: 'overlay' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'XS', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { text: '#ffffff', background: '#dc2626', overlayBackdropOpacity: 0.45, seed: '#dc2626' },
        shape: { radius: 'sm', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // TBLK-COL-07 — Search results "no results" fallback (Boost InstantSearch no-result behavior).
  {
    id: 'TBLK-COL-07',
    name: 'Search No-Results Fallback',
    description: 'Empty-state block for the search results page — a "no results" message with curated fallback suggestions and popular collections to keep shoppers on-site.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'search',
    tags: ['section', 'search', 'no-results', 'fallback', 'boost'],
    spec: {
      type: 'theme.section',
      name: 'Search No-Results Fallback',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'search',
        activation: 'section',
        title: "We couldn't find a match",
        subtitle: 'Try one of these instead',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          showOnlyWhenEmpty: true,
          noResultMessage: "No results for your search. Here are some popular picks.",
        },
        blocks: [
          { kind: 'suggestion', text: 'Best sellers', url: 'https://example.com/collections/best-sellers' },
          { kind: 'suggestion', text: 'New arrivals', url: 'https://example.com/collections/new' },
          { kind: 'suggestion', text: 'Sale', url: 'https://example.com/collections/sale' },
        ],
      },
      placement: { enabled_on: { templates: ['search'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'center', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'LG', weight: 'normal', lineHeight: 'relaxed', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // TBLK-COL-08 — Collection intro / editorial header (S&D collection header pattern).
  {
    id: 'TBLK-COL-08',
    name: 'Collection Intro Header',
    description: 'Editorial header for a collection page — title, descriptive intro copy, and an optional lifestyle image, giving merchandised collections a branded lead-in.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'header',
    tags: ['section', 'collection', 'editorial', 'header', 'gempages'],
    spec: {
      type: 'theme.section',
      name: 'Collection Intro Header',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'The Everyday Edit',
        subtitle: 'Considered essentials, made to last',
        layout: { layout: 'stacked' },
        fields: {
          bodyCopy: 'A tightly edited capsule of the pieces we reach for daily — quiet colours, honest materials, and fits that hold their shape.',
          imageUrl: 'https://cdn.example.com/collections/everyday-edit-hero.jpg',
          imagePosition: 'right',
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['collection'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'wide', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: '2XL', weight: 'normal', lineHeight: 'tight', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
      },
    },
  },

  // TBLK-COL-09 — Trust + payment badge row (Hextom trust badges / payment badges on PLP).
  {
    id: 'TBLK-COL-09',
    name: 'Collection Trust Badge Row',
    description: 'Reassurance strip below the collection header — free-shipping, easy-returns, and secure-checkout trust marks with a payment-icon row to lift browse confidence.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'trust',
    tags: ['section', 'trust', 'badges', 'social-proof', 'collection', 'hextom'],
    spec: {
      type: 'theme.section',
      name: 'Collection Trust Badge Row',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'trust',
        activation: 'section',
        title: 'Why shop with us',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          showPaymentIcons: true,
          paymentIcons: ['visa', 'mastercard', 'amex', 'apple-pay', 'shop-pay'],
        },
        blocks: [
          { kind: 'badge', text: 'Free shipping over $75', fields: { icon: 'truck' } },
          { kind: 'badge', text: '30-day easy returns', fields: { icon: 'refresh' } },
          { kind: 'badge', text: 'Secure checkout', fields: { icon: 'lock' } },
        ],
      },
      placement: { enabled_on: { templates: ['collection', 'list-collections'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45 },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'emboss' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
      },
    },
  },

  // TBLK-COL-10 — Category tile grid for the list-collections page (S&D / merchandising).
  {
    id: 'TBLK-COL-10',
    name: 'Category Tile Grid',
    description: 'Shop-by-category tile grid for the collections-list page — reorderable image tiles that route into each collection, turning the index into a merchandised entry point.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'collection', 'category', 'navigation', 'list-collections'],
    spec: {
      type: 'theme.section',
      name: 'Category Tile Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'collection-list',
        activation: 'section',
        title: 'Shop by category',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          columnsDesktop: 3,
          columnsMobile: 2,
          showTitleOverlay: true,
        },
        blocks: [
          { kind: 'collection-card', text: 'New In', imageUrl: 'https://cdn.example.com/cat/new-in.jpg', url: 'https://example.com/collections/new' },
          { kind: 'collection-card', text: 'Apparel', imageUrl: 'https://cdn.example.com/cat/apparel.jpg', url: 'https://example.com/collections/apparel' },
          { kind: 'collection-card', text: 'Accessories', imageUrl: 'https://cdn.example.com/cat/accessories.jpg', url: 'https://example.com/collections/accessories' },
          { kind: 'collection-card', text: 'Sale', imageUrl: 'https://cdn.example.com/cat/sale.jpg', url: 'https://example.com/collections/sale' },
        ],
      },
      placement: { enabled_on: { templates: ['list-collections'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'wide', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdrop: '#000000', overlayBackdropOpacity: 0.3, seed: '#2563eb' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },
];

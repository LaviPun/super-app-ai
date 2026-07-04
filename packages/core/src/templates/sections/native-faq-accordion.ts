import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * FAQ accordion — native theme.section templates (surface: native_section FAQ accordion).
 *
 * Six variants of the same section type, differing only by `layout.layout` +
 * `config.fields` + `style` + block arrangement (design-vocabulary §2 "FAQ
 * accordion" + the "3–5 layout variants driven by the same token set" rule).
 * Grounded in the real FAQ-builder surface (PageFly Accordion element:
 * pagefly.md:46,103 — expand/collapse Q&A rows in a stacked or tabbed layout;
 * plus the design-reference FAQ catalog). Each entry uses the modular
 * `config.blocks[]` model (§A.6): one `faq-item` block per question, reorderable,
 * with the question in `blocks[].text` and the answer/metadata in `blocks[].fields`.
 *
 * Every spec parses against RecipeSpecSchema (theme.section member, recipe.ts:338).
 * `layout.layout` stays within the type's option set (stacked | grid | masonry |
 * carousel) with `columns` for grid variants. Placement targets pages where FAQ
 * content actually lives (page, product, index, collection) — all ⊂
 * THEME_PLACEABLE_TEMPLATES.
 */
export const NATIVE_FAQ_ACCORDION_TEMPLATES: TemplateEntry[] = [
  // 01 — Classic single-column accordion (Apple HIG Clean): one open at a time,
  // generous whitespace, hierarchy by weight. The canonical FAQ surface.
  {
    id: 'NSEC-FAQ-01',
    name: 'FAQ — Single-Column Accordion',
    description: 'Stacked expand/collapse FAQ for a page or product — one question open at a time, clean neutral rows with a chevron toggle.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'faq', 'accordion', 'support', 'page', 'apple-hig'],
    spec: {
      type: 'theme.section',
      name: 'FAQ — Single-Column Accordion',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq',
        activation: 'section',
        title: 'Frequently asked questions',
        subtitle: 'Everything you need to know before you order',
        layout: { layout: 'stacked' },
        fields: {
          expandBehavior: 'single',
          defaultOpenIndex: 0,
          showToggleIcon: true,
          toggleIcon: 'chevron',
          dividers: true,
        },
        blocks: [
          { kind: 'faq-item', text: 'How long does shipping take?', fields: { answer: 'Orders ship within 1–2 business days. Domestic delivery is 3–5 business days; international is 7–14.', defaultOpen: true } },
          { kind: 'faq-item', text: 'What is your return policy?', fields: { answer: 'Returns are accepted within 30 days of delivery on unworn items with tags. Start a return from your account or the link in your confirmation email.' } },
          { kind: 'faq-item', text: 'Do you ship internationally?', fields: { answer: 'Yes — we ship to over 40 countries. Duties and taxes are calculated at checkout so there are no surprises on delivery.' } },
          { kind: 'faq-item', text: 'How do I track my order?', fields: { answer: 'A tracking link is emailed the moment your order ships. You can also view live status under Orders in your account.' } },
          { kind: 'faq-item', text: 'Can I change or cancel my order?', fields: { answer: 'We can edit or cancel within 1 hour of ordering. Reply to your confirmation email and we will sort it before it ships.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { text: '#111827', background: '#ffffff', border: '#e5e7eb', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
      },
    },
  },

  // 02 — Two-column accordion (grid, columns:2) for long FAQ lists on a wide
  // page. Editorial Wellness grammar: airy, border-carried, calm.
  {
    id: 'NSEC-FAQ-02',
    name: 'FAQ — Two-Column Accordion',
    description: 'Two-column FAQ grid that packs a long question list onto a wide page — each column an independent expand/collapse stack.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'faq', 'accordion', 'two-column', 'page', 'editorial-wellness'],
    spec: {
      type: 'theme.section',
      name: 'FAQ — Two-Column Accordion',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq',
        activation: 'section',
        title: 'Questions & answers',
        subtitle: 'Browse the topics our customers ask about most',
        layout: { layout: 'grid', columns: 2 },
        fields: {
          expandBehavior: 'multiple',
          columnsDesktop: 2,
          columnsMobile: 1,
          showToggleIcon: true,
          toggleIcon: 'plus-minus',
        },
        blocks: [
          { kind: 'faq-item', text: 'What materials do you use?', fields: { answer: 'Our pieces use OEKO-TEX certified organic cotton and recycled trims. Full material breakdowns are on each product page.' } },
          { kind: 'faq-item', text: 'How should I care for my items?', fields: { answer: 'Machine wash cold, hang to dry. Avoid bleach and high heat to keep colour and shape over time.' } },
          { kind: 'faq-item', text: 'Do you offer gift wrapping?', fields: { answer: 'Yes — add gift wrap at checkout for a recyclable box, ribbon, and an optional handwritten note.' } },
          { kind: 'faq-item', text: 'Are your products true to size?', fields: { answer: 'Most styles run true to size. Each product page has a size guide and fit notes from our design team.' } },
          { kind: 'faq-item', text: 'What payment methods do you accept?', fields: { answer: 'All major cards, Shop Pay, Apple Pay, Google Pay, and PayPal. Pay-in-4 is available at checkout on eligible orders.' } },
          { kind: 'faq-item', text: 'Is my payment information secure?', fields: { answer: 'Checkout is fully PCI-compliant and encrypted end to end. We never see or store your full card details.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'wide', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { text: '#1f2937', background: '#faf9f6', border: '#e7e2d8', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },

  // 03 — Searchable FAQ (searchable knowledge-base header). Stacked rows under a
  // filter box; Tech Utility grammar — dense, hairline, high-trust.
  {
    id: 'NSEC-FAQ-03',
    name: 'FAQ — Searchable Help Center',
    description: 'Help-center style FAQ with a filter box above a stacked accordion — buyers type to narrow the question list before expanding an answer.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'faq', 'accordion', 'searchable', 'support', 'tech-utility'],
    spec: {
      type: 'theme.section',
      name: 'FAQ — Searchable Help Center',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq',
        activation: 'section',
        title: 'How can we help?',
        subtitle: 'Search our answers or browse the list below',
        layout: { layout: 'stacked' },
        fields: {
          enableSearch: true,
          searchPlaceholder: 'Search questions…',
          noResultsText: 'No matches — contact support@yourstore.com',
          expandBehavior: 'single',
          showToggleIcon: true,
          toggleIcon: 'chevron',
          dividers: true,
        },
        blocks: [
          { kind: 'faq-item', text: 'Where is my order?', fields: { answer: 'Check the tracking link in your shipping email, or open Orders in your account for live status.', keywords: 'tracking delivery shipping status' } },
          { kind: 'faq-item', text: 'How do I start a return or exchange?', fields: { answer: 'Visit the returns portal linked in your confirmation email, pick the items, and print the prepaid label.', keywords: 'return exchange refund label' } },
          { kind: 'faq-item', text: 'My discount code is not working — what do I do?', fields: { answer: 'Codes are case-sensitive and cannot stack with automatic sales. If it still fails, contact us and we will apply it manually.', keywords: 'discount code promo coupon' } },
          { kind: 'faq-item', text: 'Do you offer a warranty?', fields: { answer: 'Every item is covered by a 1-year warranty against manufacturing defects. Keep your order number to file a claim.', keywords: 'warranty guarantee defect repair' } },
          { kind: 'faq-item', text: 'How do I update my shipping address?', fields: { answer: 'If your order has not shipped, reply to your confirmation email with the new address and we will update it.', keywords: 'address change edit shipping' } },
        ],
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { text: '#0f172a', background: '#f8fafc', border: '#cbd5e1', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'sm', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'mechanical' },
      },
    },
  },

  // 04 — Categorized FAQ (grouped by topic). Blocks carry a `category` field so
  // the renderer groups them into Shipping / Returns / Product tabs-or-headers.
  {
    id: 'NSEC-FAQ-04',
    name: 'FAQ — Categorized by Topic',
    description: 'Topic-grouped FAQ accordion — questions bucketed into Shipping, Returns, and Product headers so buyers jump to their concern fast.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'faq', 'accordion', 'categorized', 'support', 'page'],
    spec: {
      type: 'theme.section',
      name: 'FAQ — Categorized by Topic',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq',
        activation: 'section',
        title: 'Help & FAQs',
        subtitle: 'Grouped by topic so you find answers faster',
        layout: { layout: 'stacked' },
        fields: {
          groupByCategory: true,
          categoryOrder: ['Shipping', 'Returns', 'Product'],
          expandBehavior: 'multiple',
          showToggleIcon: true,
          toggleIcon: 'chevron',
        },
        blocks: [
          { kind: 'faq-item', text: 'When will my order arrive?', fields: { category: 'Shipping', answer: 'Standard delivery is 3–5 business days after dispatch. Express options appear at checkout.' } },
          { kind: 'faq-item', text: 'Do you offer free shipping?', fields: { category: 'Shipping', answer: 'Yes — free standard shipping on orders over $75. The threshold shows in your cart.' } },
          { kind: 'faq-item', text: 'How long do refunds take?', fields: { category: 'Returns', answer: 'Refunds are issued to the original payment method within 5–7 business days of us receiving the return.' } },
          { kind: 'faq-item', text: 'Can I exchange for a different size?', fields: { category: 'Returns', answer: 'Absolutely. Choose Exchange in the returns portal and we ship the new size as soon as the original is scanned.' } },
          { kind: 'faq-item', text: 'Are your products vegan?', fields: { category: 'Product', answer: 'The majority of our range is vegan. Look for the vegan badge on each product page for confirmation.' } },
          { kind: 'faq-item', text: 'How do I find my size?', fields: { category: 'Product', answer: 'Every product page has a size chart with measurements and a fit recommendation from our team.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { text: '#111827', background: '#ffffff', border: '#e5e7eb', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },

  // 05 — Product-page shipping & returns accordion. Compact, dividerless card that
  // drops under an add-to-cart block; answers the buyer's last-mile objections.
  {
    id: 'NSEC-FAQ-05',
    name: 'FAQ — Product Shipping & Returns',
    description: 'Compact PDP accordion answering shipping, returns, and care right under the buy button — reduces last-mile hesitation on the product page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'faq', 'accordion', 'product', 'shipping', 'conversion'],
    spec: {
      type: 'theme.section',
      name: 'FAQ — Product Shipping & Returns',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq',
        activation: 'section',
        title: 'Shipping, returns & care',
        layout: { layout: 'stacked' },
        fields: {
          expandBehavior: 'single',
          compact: true,
          showToggleIcon: true,
          toggleIcon: 'plus-minus',
          dividers: false,
        },
        blocks: [
          { kind: 'faq-item', text: 'Shipping', fields: { answer: 'Ships in 1–2 business days. Free over $75. Express and next-day available at checkout.' } },
          { kind: 'faq-item', text: 'Returns', fields: { answer: '30-day free returns on unworn items. Print a prepaid label from the returns portal.' } },
          { kind: 'faq-item', text: 'Product care', fields: { answer: 'Machine wash cold, hang dry. Store flat to preserve shape. Full care guide inside every box.' } },
          { kind: 'faq-item', text: 'Warranty', fields: { answer: 'Backed by a 1-year warranty against manufacturing defects — keep your order number for claims.' } },
        ],
      },
      placement: { enabled_on: { templates: ['product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'auto', zIndex: 'base' },
        spacing: { padding: 'tight', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { text: '#1f2937', background: '#ffffff', border: '#e5e7eb', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
      },
    },
  },

  // 06 — Bold DTC dark-ground FAQ for a landing/home page. Statement heading,
  // one vibrant accent seed, glow elevation. Centered header, stacked rows.
  {
    id: 'NSEC-FAQ-06',
    name: 'FAQ — Bold Dark Landing Accordion',
    description: 'High-contrast dark-ground FAQ accordion for a landing or home page — statement heading, accent-seeded toggles, glow depth on each row.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'faq', 'accordion', 'index', 'bold-dtc', 'dark'],
    spec: {
      type: 'theme.section',
      name: 'FAQ — Bold Dark Landing Accordion',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq',
        activation: 'section',
        title: 'Got questions? We got you.',
        subtitle: 'The stuff people ask before they hit buy',
        layout: { layout: 'stacked' },
        fields: {
          expandBehavior: 'single',
          defaultOpenIndex: 0,
          showToggleIcon: true,
          toggleIcon: 'chevron',
          dividers: true,
        },
        blocks: [
          { kind: 'faq-item', text: 'Is it actually worth it?', fields: { answer: 'Over 12,000 five-star reviews say yes. If it is not for you, our 30-day returns have your back.', defaultOpen: true } },
          { kind: 'faq-item', text: 'How fast will it get here?', fields: { answer: 'Order today, ships tomorrow. Most orders land in 3–5 days, with next-day at checkout.' } },
          { kind: 'faq-item', text: 'What if it doesn’t fit?', fields: { answer: 'Free exchanges, no questions. Swap sizes in the returns portal and we ship the new one straight away.' } },
          { kind: 'faq-item', text: 'Can I pay later?', fields: { answer: 'Yes — Shop Pay and pay-in-4 are available at checkout on eligible orders.' } },
          { kind: 'faq-item', text: 'Do you restock sold-out items?', fields: { answer: 'Popular pieces restock often. Tap "Notify me" on any sold-out product to get first dibs.' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'tight', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#f9fafb', background: '#0b0b0f', border: '#26262e', seed: '#7c3aed', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'lg', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },
];

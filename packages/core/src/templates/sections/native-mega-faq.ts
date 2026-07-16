import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * NSEC-MFAQ — mega-FAQ with search (V-B renderer batch B12).
 *
 * `theme.section` templates, `kind: 'faq'`, with `config.searchable: true`. The
 * accordion is the existing SSR'd faq render; `searchable` adds a client-side search
 * input + count/empty-state above it, and superapp-modules.js builds category chips
 * from any `faq-item` block that carries `fields.category`. The content stays fully
 * in the DOM (SEO + JS-off), so this is a pure enhancement layer over the accordion.
 */
export const NATIVE_MEGA_FAQ_TEMPLATES: TemplateEntry[] = [
  // NSEC-MFAQ-01 — 20-item searchable help center with categories (Editorial, luxe).
  {
    id: 'NSEC-MFAQ-01',
    name: 'FAQ — Searchable Help Center',
    description: 'A 20-question searchable help center with category chips (Orders, Shipping, Returns, Product, Account) filtering the accordion live, for a help or support page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'faq', 'searchable', 'help-center', 'page'],
    spec: {
      type: 'theme.section',
      name: 'FAQ — Searchable Help Center',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq',
        activation: 'section',
        title: 'How can we help?',
        subtitle: 'Search or browse by topic.',
        searchable: true,
        fields: { searchPlaceholder: 'Search help articles' },
        blocks: [
          { kind: 'faq-item', text: 'Where is my order?', fields: { category: 'Orders', answer: 'Track it from the link in your confirmation email, or from Account → Orders.' } },
          { kind: 'faq-item', text: 'Can I change my order after placing it?', fields: { category: 'Orders', answer: 'We can edit orders within one hour of purchase — contact support right away.' } },
          { kind: 'faq-item', text: 'How do I cancel an order?', fields: { category: 'Orders', answer: 'Unshipped orders can be cancelled from Account → Orders → Cancel.' } },
          { kind: 'faq-item', text: 'Do you take pre-orders?', fields: { category: 'Orders', answer: 'Yes — pre-order items ship on the date shown on the product page.' } },
          { kind: 'faq-item', text: 'How long does shipping take?', fields: { category: 'Shipping', answer: 'Standard shipping is 3–5 business days; express is 1–2.' } },
          { kind: 'faq-item', text: 'Do you ship internationally?', fields: { category: 'Shipping', answer: 'We ship to 40+ countries. Duties are calculated at checkout.' } },
          { kind: 'faq-item', text: 'Is shipping free?', fields: { category: 'Shipping', answer: 'Orders over $50 ship free within the US.' } },
          { kind: 'faq-item', text: 'Can I change my shipping address?', fields: { category: 'Shipping', answer: 'Yes, before the order ships — contact support with your order number.' } },
          { kind: 'faq-item', text: 'What is your return policy?', fields: { category: 'Returns', answer: 'Unused items can be returned within 30 days for a full refund.' } },
          { kind: 'faq-item', text: 'How do I start a return?', fields: { category: 'Returns', answer: 'Open Account → Orders → Return and print the prepaid label.' } },
          { kind: 'faq-item', text: 'When will I get my refund?', fields: { category: 'Returns', answer: 'Refunds post to your original payment method 3–5 days after we receive the item.' } },
          { kind: 'faq-item', text: 'Can I exchange for a different size?', fields: { category: 'Returns', answer: 'Yes — start a return and select "exchange" to lock in the new size.' } },
          { kind: 'faq-item', text: 'How do I find my size?', fields: { category: 'Product', answer: 'Each product page has a size guide — measure and match to the chart.' } },
          { kind: 'faq-item', text: 'What are your products made of?', fields: { category: 'Product', answer: 'Materials are listed on every product page under "Details".' } },
          { kind: 'faq-item', text: 'How do I care for my item?', fields: { category: 'Product', answer: 'Follow the care card included with your order, or the product page care notes.' } },
          { kind: 'faq-item', text: 'Are your products cruelty-free?', fields: { category: 'Product', answer: 'Yes — we are certified cruelty-free and never test on animals.' } },
          { kind: 'faq-item', text: 'How do I create an account?', fields: { category: 'Account', answer: 'Choose "Create account" at checkout or from the account icon in the header.' } },
          { kind: 'faq-item', text: 'I forgot my password.', fields: { category: 'Account', answer: 'Use "Forgot password" on the login page to reset via email.' } },
          { kind: 'faq-item', text: 'How do I update my email?', fields: { category: 'Account', answer: 'Change it under Account → Settings → Contact.' } },
          { kind: 'faq-item', text: 'How do I delete my account?', fields: { category: 'Account', answer: 'Email support and we will remove your data within 30 days.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'md', borderWidth: 'none', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
    },
  },

  // NSEC-MFAQ-02 — Shipping & returns mega-FAQ (Bold DTC).
  {
    id: 'NSEC-MFAQ-02',
    name: 'FAQ — Shipping & Returns',
    description: 'A searchable shipping-and-returns mega-FAQ — a focused set of delivery, returns, and refund questions with a live filter, for a shipping-policy or support page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'faq',
    tags: ['section', 'faq', 'searchable', 'shipping', 'returns'],
    spec: {
      type: 'theme.section',
      name: 'FAQ — Shipping & Returns',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq',
        activation: 'section',
        title: 'Shipping & returns',
        subtitle: 'Search your question below.',
        searchable: true,
        fields: { searchPlaceholder: 'Search shipping & returns' },
        blocks: [
          { kind: 'faq-item', text: 'When will my order ship?', fields: { category: 'Shipping', answer: 'Orders placed before 2pm ET ship the same business day.' } },
          { kind: 'faq-item', text: 'How much does shipping cost?', fields: { category: 'Shipping', answer: 'Flat $5 standard, free over $50, express from $12.' } },
          { kind: 'faq-item', text: 'Do you deliver on weekends?', fields: { category: 'Shipping', answer: 'Express orders can arrive Saturday; standard is business days only.' } },
          { kind: 'faq-item', text: 'My tracking has not updated — what now?', fields: { category: 'Shipping', answer: 'Carriers can take 24–48h to scan. If it stalls beyond that, contact us.' } },
          { kind: 'faq-item', text: 'How long do I have to return?', fields: { category: 'Returns', answer: 'You have 30 days from delivery to start a return.' } },
          { kind: 'faq-item', text: 'Is return shipping free?', fields: { category: 'Returns', answer: 'Yes — US returns include a prepaid label at no cost.' } },
          { kind: 'faq-item', text: 'Can I return a sale item?', fields: { category: 'Returns', answer: 'Final-sale items are not returnable; everything else is.' } },
          { kind: 'faq-item', text: 'When is my refund issued?', fields: { category: 'Refunds', answer: 'Within 3–5 business days of us receiving your return.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'product'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { text: '#f8fafc', background: '#111827', overlayBackdropOpacity: 0.4, seed: '#e11d48' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'bold',
      },
    },
  },
];

import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/**
 * Contact / team / timeline / how-to-steps — native theme.section templates
 * (surface: native_section, phase 034 contact-team-timeline unit, floor 8).
 *
 * Eight variants across four related "about/contact" section families, each a
 * `theme.section` differing only by `layout.layout` + `config.fields` + `style`
 * + block arrangement (design-vocabulary §2 catalog: "contact-map" split ·
 * stacked · full-map · card; "steps-howto" numbered · timeline · cards ·
 * horizontal; plus the team-grid + timeline story archetypes). No new markup per
 * variant — the same token substrate (§1) drives every entry.
 *
 * Grounded in the real page-builder surfaces the corpus documents:
 *  - PageFly Google Map + Mailchimp/Customer Form elements + Icon List + Tabs/
 *    Accordion (pagefly.md:46) → the contact block (map + address rows + inline
 *    email capture) and the numbered/step how-to layouts.
 *  - GemPages Icon List, Testimonial, Before & After, Countdown, Accordion, and
 *    the section→row→column tree (gempages.md:33,102) → the team grid, the
 *    timeline/milestone story, and the horizontal process strip.
 *  - design-vocabulary §2 (steps-howto + contact-map variant sets) and §4 style
 *    packs (Editorial Wellness for the story/about surfaces, Apple HIG Clean for
 *    the contact/utility ones, Tech Utility for the dense process strip).
 *
 * Modular-blocks model (§A.6): list-shaped sections put one block per item in
 * `config.blocks[]` — `contact-method` / `team-member` / `milestone` / `step`
 * block kinds — with the headline copy in `blocks[].text`, the block image in
 * `blocks[].imageUrl`, an optional link in `blocks[].url`, and everything richer
 * (role, date, phone, step number, …) in `blocks[].fields`. Contact forms are a
 * declarative field list under `config.fields.formFields` (the section renders
 * the inputs; capture wiring is honest — an email field collects, it does not
 * imply a guaranteed live subscribe until the app-proxy form handler ships).
 *
 * Every spec parses against RecipeSpecSchema (theme.section member,
 * recipe.ts:338). `layout.layout` stays within the type's option set
 * (stacked | grid | masonry | carousel) plus `columns` for grid variants.
 * Placement targets pages where this content actually lives (page, index,
 * article, product) — all ⊂ THEME_PLACEABLE_TEMPLATES.
 */
export const NATIVE_CONTACT_TEAM_TIMELINE_TEMPLATES: TemplateEntry[] = [
  // ── Contact / map — variant 1: split (map left, address + inline email right) ──
  {
    id: 'NSEC-CONT-01',
    name: 'Contact — Split Map & Details',
    description:
      'Two-column contact section for the contact page — an embedded map beside address, hours and an inline email-capture field.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'contact',
    tags: ['section', 'contact', 'map', 'page', 'split'],
    spec: {
      type: 'theme.section',
      name: 'Contact — Split Map & Details',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'contact',
        activation: 'section',
        title: 'Get in touch',
        subtitle: 'We reply within one business day.',
        layout: { layout: 'columns', columns: 2 },
        fields: {
          mapEmbedQuery: '350 Mission St, San Francisco, CA',
          showMap: true,
          mapSide: 'left',
          formFields: [
            { key: 'email', label: 'Email', kind: 'email', required: true },
            { key: 'message', label: 'How can we help?', kind: 'textarea', required: false },
          ],
          submitLabel: 'Send message',
        },
        blocks: [
          { kind: 'contact-method', text: 'Visit', fields: { detail: '350 Mission St, San Francisco, CA 94105', icon: 'pin' } },
          { kind: 'contact-method', text: 'Call', fields: { detail: '+1 (415) 555-0142', icon: 'phone' }, },
          { kind: 'contact-method', text: 'Hours', fields: { detail: 'Mon–Fri, 9am–6pm PT', icon: 'clock' } },
        ],
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#1f3a2e' },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── Contact / map — variant 2: stacked (centered form over full-width map) ──
  {
    id: 'NSEC-CONT-02',
    name: 'Contact — Stacked Form Over Map',
    description:
      'Centered contact form stacked above a full-width map band — the compact single-column contact layout for narrow pages.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'contact',
    tags: ['section', 'contact', 'map', 'page', 'stacked'],
    spec: {
      type: 'theme.section',
      name: 'Contact — Stacked Form Over Map',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'contact',
        activation: 'section',
        title: 'Questions? Reach out.',
        subtitle: 'Our support team is here to help.',
        layout: { layout: 'stacked' },
        fields: {
          mapEmbedQuery: '12 Rue de Rivoli, Paris',
          showMap: true,
          mapSide: 'below',
          formFields: [
            { key: 'name', label: 'Name', kind: 'text', required: true },
            { key: 'email', label: 'Email', kind: 'email', required: true },
            { key: 'message', label: 'Message', kind: 'textarea', required: true },
          ],
          submitLabel: 'Submit',
        },
        blocks: [],
      },
      placement: { enabled_on: { templates: ['page'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── Contact / map — variant 3: card grid (method cards, no form) ──
  {
    id: 'NSEC-CONT-03',
    name: 'Contact — Method Cards',
    description:
      'Grid of contact-method cards (email, chat, store visit, press) — a formless "how to reach us" section for a page or the homepage.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'contact',
    tags: ['section', 'contact', 'grid', 'page', 'card'],
    spec: {
      type: 'theme.section',
      name: 'Contact — Method Cards',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'contact',
        activation: 'section',
        title: 'How to reach us',
        subtitle: 'Pick whatever is easiest.',
        layout: { layout: 'grid', columns: 4 },
        fields: { showMap: false },
        blocks: [
          { kind: 'contact-method', text: 'Email', url: 'mailto:hello@example.com', fields: { detail: 'hello@example.com', icon: 'mail' } },
          { kind: 'contact-method', text: 'Live chat', fields: { detail: 'Mon–Fri, 9–6 PT', icon: 'chat' } },
          { kind: 'contact-method', text: 'Visit a store', fields: { detail: 'Find your nearest location', icon: 'pin' } },
          { kind: 'contact-method', text: 'Press', url: 'mailto:press@example.com', fields: { detail: 'press@example.com', icon: 'news' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#1e3a5f' },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── Team — variant 4: portrait grid (staff cards with role + socials) ──
  {
    id: 'NSEC-CONT-04',
    name: 'Team — Portrait Grid',
    description:
      'Meet-the-team grid of portrait cards — each block is a member with photo, name, role and an optional profile link.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'team',
    tags: ['section', 'team', 'about', 'grid', 'page', 'editorial'],
    spec: {
      type: 'theme.section',
      name: 'Team — Portrait Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'team',
        activation: 'section',
        title: 'Meet the makers',
        subtitle: 'The people behind every order.',
        layout: { layout: 'grid', columns: 3 },
        fields: { showRole: true, showSocials: true },
        blocks: [
          { kind: 'team-member', text: 'Ava Nguyen', imageUrl: 'https://cdn.example.com/team/ava.jpg', url: 'https://example.com/team/ava', fields: { role: 'Founder & CEO', bio: 'Started the studio in her garage in 2016.' } },
          { kind: 'team-member', text: 'Marcus Lee', imageUrl: 'https://cdn.example.com/team/marcus.jpg', fields: { role: 'Head of Product', bio: 'Obsessed with fit and finish.' } },
          { kind: 'team-member', text: 'Priya Sharma', imageUrl: 'https://cdn.example.com/team/priya.jpg', fields: { role: 'Lead Designer', bio: 'Draws every pattern by hand first.' } },
          { kind: 'team-member', text: 'Diego Alvarez', imageUrl: 'https://cdn.example.com/team/diego.jpg', fields: { role: 'Customer Care', bio: 'Answers your emails on weekends too.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'airy' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'relaxed', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#64748b' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── Team — variant 5: horizontal roster carousel (larger teams) ──
  {
    id: 'NSEC-CONT-05',
    name: 'Team — Roster Carousel',
    description:
      'Horizontally scrolling team roster for larger teams — swipeable portrait cards with name and role, one member per block.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'team',
    tags: ['section', 'team', 'about', 'carousel', 'page', 'editorial'],
    spec: {
      type: 'theme.section',
      name: 'Team — Roster Carousel',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'team',
        activation: 'section',
        title: 'Our crew',
        subtitle: 'Fifty-plus specialists, one obsession.',
        layout: { layout: 'carousel' },
        fields: { showRole: true, autoAdvance: false, peekNext: true },
        blocks: [
          { kind: 'team-member', text: 'Sofia Rossi', imageUrl: 'https://cdn.example.com/team/sofia.jpg', fields: { role: 'Operations' } },
          { kind: 'team-member', text: 'Ken Watanabe', imageUrl: 'https://cdn.example.com/team/ken.jpg', fields: { role: 'Engineering' } },
          { kind: 'team-member', text: 'Amara Okafor', imageUrl: 'https://cdn.example.com/team/amara.jpg', fields: { role: 'Marketing' } },
          { kind: 'team-member', text: 'Liam Murphy', imageUrl: 'https://cdn.example.com/team/liam.jpg', fields: { role: 'Fulfillment' } },
          { kind: 'team-member', text: 'Yuki Tanaka', imageUrl: 'https://cdn.example.com/team/yuki.jpg', fields: { role: 'Quality' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#1f3a2e' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
        pack: 'luxe',
      },
    },
  },

  // ── Timeline — variant 6: vertical milestone story (brand history) ──
  {
    id: 'NSEC-CONT-06',
    name: 'Timeline — Milestone Story',
    description:
      'Vertical brand-history timeline — one milestone block per year with date, headline and photo, alternating down the spine.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'timeline',
    tags: ['section', 'timeline', 'about', 'story', 'page', 'editorial'],
    spec: {
      type: 'theme.section',
      name: 'Timeline — Milestone Story',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'timeline',
        activation: 'section',
        title: 'Our story so far',
        subtitle: 'From one bench to a global studio.',
        layout: { layout: 'stacked' },
        fields: { alternate: true, showConnector: true },
        blocks: [
          { kind: 'milestone', text: 'The first batch', imageUrl: 'https://cdn.example.com/story/2016.jpg', fields: { date: '2016', detail: 'We sold out our launch run in 48 hours.' } },
          { kind: 'milestone', text: 'A real workshop', imageUrl: 'https://cdn.example.com/story/2019.jpg', fields: { date: '2019', detail: 'Moved into a 4,000 sq ft space downtown.' } },
          { kind: 'milestone', text: 'Going carbon-neutral', imageUrl: 'https://cdn.example.com/story/2022.jpg', fields: { date: '2022', detail: 'Every order now ships plastic-free.' } },
          { kind: 'milestone', text: 'One million shipped', imageUrl: 'https://cdn.example.com/story/2025.jpg', fields: { date: '2025', detail: 'Thank you — this is only the start.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'article'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'LG', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8b7355' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },

  // ── How-to steps — variant 7: numbered vertical steps (setup / how-it-works) ──
  {
    id: 'NSEC-CONT-07',
    name: 'How It Works — Numbered Steps',
    description:
      'Numbered how-it-works section — one step block per stage with a number badge, headline and short instruction, stacked top to bottom.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'steps',
    tags: ['section', 'how-to', 'steps', 'page', 'product'],
    spec: {
      type: 'theme.section',
      name: 'How It Works — Numbered Steps',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'steps',
        activation: 'section',
        title: 'How it works',
        subtitle: 'Three steps from cart to doorstep.',
        layout: { layout: 'stacked' },
        fields: { numbered: true, showConnector: true },
        blocks: [
          { kind: 'step', text: 'Pick your pieces', fields: { number: 1, detail: 'Browse the collection and build your set.' } },
          { kind: 'step', text: 'Personalise it', fields: { number: 2, detail: 'Add a monogram or gift note at checkout.' } },
          { kind: 'step', text: 'We ship it fast', fields: { number: 3, detail: 'Free carbon-neutral delivery in 2–4 days.' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'product', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'MD', weight: 'normal', lineHeight: 'normal', align: 'left' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#8a7f6d' },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        pack: 'luxe',
      },
    },
  },

  // ── How-to steps — variant 8: horizontal process strip (dense, tech-utility) ──
  {
    id: 'NSEC-CONT-08',
    name: 'How It Works — Horizontal Process Strip',
    description:
      'Horizontal process strip — evenly spaced step columns with connectors, a dense "how it works" layout for wide content pages.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'steps',
    tags: ['section', 'how-to', 'steps', 'grid', 'page'],
    spec: {
      type: 'theme.section',
      name: 'How It Works — Horizontal Process Strip',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'steps',
        activation: 'section',
        title: 'The process',
        subtitle: 'Four stages, fully transparent.',
        layout: { layout: 'grid', columns: 4 },
        fields: { numbered: true, showConnector: true, orientation: 'horizontal' },
        blocks: [
          { kind: 'step', text: 'Order', fields: { number: 1, detail: 'Placed and confirmed instantly.', icon: 'cart' } },
          { kind: 'step', text: 'Craft', fields: { number: 2, detail: 'Made to order in our workshop.', icon: 'tools' } },
          { kind: 'step', text: 'Quality check', fields: { number: 3, detail: 'Inspected by hand before it leaves.', icon: 'check' } },
          { kind: 'step', text: 'Deliver', fields: { number: 4, detail: 'Tracked to your door in 2–4 days.', icon: 'truck' } },
        ],
      },
      placement: { enabled_on: { templates: ['page', 'index'] as (typeof THEME_PLACEABLE_TEMPLATES)[number][] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'tight', density: 'compact' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#e2e8f0', background: '#0f172a', overlayBackdropOpacity: 0.45, seed: '#38bdf8' },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
        pack: 'bold',
      },
    },
  },
];

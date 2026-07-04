/**
 * Native-section templates — FEATURE BENTO / COLUMNS (theme.section, native_section surface).
 *
 * Eight `theme.section` recipes for a store's "why us / features" band: mixed-size
 * bento tiles and even feature columns. Every entry is the SAME modular-block model
 * (§A.6): `config.blocks[]` is the reorderable feature list, each block a
 * `{ kind: 'feature', text, imageUrl?, url?, fields }` object; the renderer reads
 * `text` (copy), `imageUrl` (tile media/icon), `url` (tile link) first-class, and the
 * per-tile settings (heading, eyebrow, span, accent, …) live in `blocks[].fields`.
 *
 * The eight differ only by `config.layout.layout` (grid | masonry | stacked | carousel),
 * `config.fields` (columns, spans, group-hover), `style.*` (a style-pack grammar), and
 * block arrangement — NOT by markup. Grounded in design-vocabulary §2 ("Feature bento
 * grid — mixed-size tiles, coordinated group-hover") + §4 (six style packs), and the
 * page-builder feature-band vocabulary in the GemPages corpus record (Icon List /
 * feature rows, Before & After, product-detail splits).
 *
 * Vocabulary is authored ONLY against what exists in recipe.ts (theme.section member)
 * + allowed-values.ts today: layout ∈ {stacked,grid,masonry,carousel},
 * THEME_PLACEABLE_TEMPLATES for placement, StorefrontStyle enums for style.
 */
import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

/** Narrowing helper so `placement.enabled_on.templates` is the placeable-template tuple type. */
type PlaceableTemplate = (typeof THEME_PLACEABLE_TEMPLATES)[number];

export const NATIVE_FEATURE_BENTO_TEMPLATES: TemplateEntry[] = [
  // 01 — Bento grid, mixed-size tiles, one hero span. Apple-HIG-clean grammar.
  {
    id: 'NSEC-BENTO-01',
    name: 'Feature Bento — Mixed-Size Grid',
    description:
      'Feature "why us" band as a bento grid of mixed-size tiles with a spanning hero tile and coordinated group-hover — for the homepage or a landing page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'feature-bento', 'bento', 'features', 'grid', 'index', 'apple-hig'],
    spec: {
      type: 'theme.section',
      name: 'Feature Bento — Mixed-Size Grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'feature',
        activation: 'section',
        title: 'Built different',
        subtitle: 'Everything that goes into every order',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          columnsDesktop: 3,
          columnsMobile: 1,
          groupHover: true,
          heroBlockIndex: 0,
        },
        blocks: [
          {
            kind: 'feature',
            text: 'Made to last — components tested past 10,000 cycles, not to a price point.',
            imageUrl: 'https://cdn.example.com/features/durability.jpg',
            fields: { eyebrow: 'Engineering', heading: 'Over-built on purpose', span: 'wide', accent: '#111827' },
          },
          {
            kind: 'feature',
            text: 'Ships free over $50, arrives in 2–4 days from the closest of three warehouses.',
            fields: { eyebrow: 'Fulfillment', heading: 'Fast, free shipping', span: 'single', icon: 'truck' },
          },
          {
            kind: 'feature',
            text: 'Not right? 30 days, no receipt needed, a prepaid label in one click.',
            fields: { eyebrow: 'Returns', heading: 'Painless returns', span: 'single', icon: 'refresh' },
          },
          {
            kind: 'feature',
            text: 'Real humans, same day, from people who actually use the product.',
            fields: { eyebrow: 'Support', heading: 'Talk to a person', span: 'single', icon: 'chat' },
          },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { text: '#111827', background: '#ffffff', border: '#e5e7eb', seed: '#111827', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'sm', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },

  // 02 — Masonry bento, staggered tiles, imagery-led. Editorial-wellness grammar.
  {
    id: 'NSEC-BENTO-02',
    name: 'Feature Bento — Masonry (Imagery-Led)',
    description:
      'Staggered masonry bento of feature tiles with large lifestyle imagery and airy whitespace — an editorial "the details" band for a homepage or brand page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'feature-bento', 'bento', 'features', 'masonry', 'editorial-wellness'],
    spec: {
      type: 'theme.section',
      name: 'Feature Bento — Masonry',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'feature',
        activation: 'section',
        title: 'In the details',
        subtitle: 'The quiet things you notice after the first week',
        layout: { layout: 'masonry', columns: 3 },
        fields: {
          columnsDesktop: 3,
          columnsMobile: 1,
          groupHover: true,
          imageryLed: true,
        },
        blocks: [
          {
            kind: 'feature',
            text: 'Grown without synthetic pesticides on a single family farm we visit twice a year.',
            imageUrl: 'https://cdn.example.com/features/farm.jpg',
            fields: { eyebrow: 'Sourcing', heading: 'One farm, traceable', span: 'tall' },
          },
          {
            kind: 'feature',
            text: 'Recycled-fibre mailer, soy inks, zero plastic — recyclable kerbside end to end.',
            imageUrl: 'https://cdn.example.com/features/packaging.jpg',
            fields: { eyebrow: 'Packaging', heading: 'Plastic-free', span: 'single' },
          },
          {
            kind: 'feature',
            text: 'Dyed in small batches so the colour is deep and even, never blotchy.',
            imageUrl: 'https://cdn.example.com/features/dye.jpg',
            fields: { eyebrow: 'Craft', heading: 'Small-batch dye', span: 'single' },
          },
          {
            kind: 'feature',
            text: 'Finished and inspected by hand — each piece signed by the maker.',
            imageUrl: 'https://cdn.example.com/features/hand-finish.jpg',
            fields: { eyebrow: 'Finishing', heading: 'Hand-finished', span: 'wide' },
          },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'wide', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'loose', density: 'airy' },
        typography: { size: 'XL', weight: 'normal', lineHeight: 'relaxed', align: 'left' },
        colors: { text: '#1c1917', background: '#faf9f7', border: '#e7e2db', seed: '#8a7f70', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'xl', borderWidth: 'none', shadow: 'sm', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
      },
    },
  },

  // 03 — Bold-DTC bento, saturated accent on dark, one hero tile + group-hover glow.
  {
    id: 'NSEC-BENTO-03',
    name: 'Feature Bento — Bold DTC (Dark)',
    description:
      'High-energy dark bento with a saturated accent and a spanning hero tile — a statement "why it works" band for a bold DTC homepage or product page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'feature-bento', 'bento', 'features', 'grid', 'bold-dtc'],
    spec: {
      type: 'theme.section',
      name: 'Feature Bento — Bold DTC',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'feature',
        activation: 'section',
        title: 'Why it actually works',
        subtitle: 'No fillers. No fluff. Just the good stuff.',
        layout: { layout: 'grid', columns: 4 },
        fields: {
          columnsDesktop: 4,
          columnsMobile: 1,
          groupHover: true,
          heroBlockIndex: 0,
          glowOnHover: true,
        },
        blocks: [
          {
            kind: 'feature',
            text: 'A clinically studied dose in every serving — the amount that actually does something.',
            imageUrl: 'https://cdn.example.com/features/dose.jpg',
            fields: { eyebrow: 'Formula', heading: 'Full clinical dose', span: 'wide', accent: '#ff4d2e' },
          },
          {
            kind: 'feature',
            text: 'Third-party lab tested every batch. Certificates on every product page.',
            fields: { eyebrow: 'Proof', heading: 'Lab-tested', span: 'single', icon: 'flask' },
          },
          {
            kind: 'feature',
            text: 'Absorbs 3× faster than the powder you are probably using now.',
            fields: { eyebrow: 'Science', heading: '3× absorption', span: 'single', icon: 'bolt' },
          },
          {
            kind: 'feature',
            text: '90-day money-back guarantee. Feel it or your money back, simple.',
            fields: { eyebrow: 'Guarantee', heading: '90-day promise', span: 'single', icon: 'shield' },
          },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: '2XL', weight: 'bold', lineHeight: 'tight', align: 'left' },
        colors: {
          text: '#f8fafc',
          background: '#0b0b0f',
          border: '#26262e',
          buttonBg: '#ff4d2e',
          buttonText: '#0b0b0f',
          seed: '#ff4d2e',
          overlayBackdropOpacity: 0.45,
        },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'lg', elevation: 'glow' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
      },
    },
  },

  // 04 — Minimal-luxe bento, near-mono, tight radius, embossed material, duotone tiles.
  {
    id: 'NSEC-BENTO-04',
    name: 'Feature Bento — Minimal Luxe',
    description:
      'Restrained near-mono bento with tight radius and embossed tiles — a quiet luxury "the craft" band for a premium homepage or collection page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'feature-bento', 'bento', 'features', 'grid', 'minimal-luxe'],
    spec: {
      type: 'theme.section',
      name: 'Feature Bento — Minimal Luxe',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'feature',
        activation: 'section',
        title: 'The craft',
        subtitle: 'Considered, not decorated',
        layout: { layout: 'grid', columns: 2 },
        fields: {
          columnsDesktop: 2,
          columnsMobile: 1,
          groupHover: false,
          duotone: true,
        },
        blocks: [
          {
            kind: 'feature',
            text: 'Full-grain Italian leather that patinas with wear rather than wearing out.',
            imageUrl: 'https://cdn.example.com/features/leather.jpg',
            fields: { eyebrow: '01', heading: 'Full-grain leather', span: 'single' },
          },
          {
            kind: 'feature',
            text: 'Saddle-stitched by hand with waxed linen thread — the stitch that outlives the machine.',
            imageUrl: 'https://cdn.example.com/features/stitch.jpg',
            fields: { eyebrow: '02', heading: 'Hand saddle-stitch', span: 'single' },
          },
          {
            kind: 'feature',
            text: 'Solid brass hardware, un-plated, so it ages to a warm honeyed tone.',
            imageUrl: 'https://cdn.example.com/features/brass.jpg',
            fields: { eyebrow: '03', heading: 'Solid brass', span: 'single' },
          },
          {
            kind: 'feature',
            text: 'A lifetime guarantee against anything but the wear you earn.',
            imageUrl: 'https://cdn.example.com/features/guarantee.jpg',
            fields: { eyebrow: '04', heading: 'Lifetime guarantee', span: 'single' },
          },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'collection'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'tight', density: 'airy' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'relaxed', align: 'left' },
        colors: { text: '#1a1a1a', background: '#f4f2ee', border: '#d8d4cc', seed: '#9c8f7a', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'sm', elevation: 'emboss' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },

  // 05 — Playful-commerce bento, rounded pastel tiles, icon-forward, self-advancing feel.
  {
    id: 'NSEC-BENTO-05',
    name: 'Feature Bento — Playful Pastel',
    description:
      'Friendly rounded pastel bento with icon-forward tiles — a warm "what you get" band for a playful homepage or landing page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'feature-bento', 'bento', 'features', 'grid', 'playful-commerce'],
    spec: {
      type: 'theme.section',
      name: 'Feature Bento — Playful Pastel',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'feature',
        activation: 'section',
        title: 'What you get',
        subtitle: 'Little things that make it feel good',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          columnsDesktop: 3,
          columnsMobile: 1,
          groupHover: true,
          iconForward: true,
        },
        blocks: [
          {
            kind: 'feature',
            text: 'Pick your scent, your colour, even the note on the card — no extra charge.',
            fields: { eyebrow: 'Yours', heading: 'Make it yours', span: 'single', icon: 'sparkles', tint: '#ffe6ef' },
          },
          {
            kind: 'feature',
            text: 'A surprise sample tucked into every box — a new favourite, on us.',
            fields: { eyebrow: 'Extra', heading: 'A little gift', span: 'single', icon: 'gift', tint: '#e6f0ff' },
          },
          {
            kind: 'feature',
            text: 'Subscribe and skip, swap, or pause any time from a two-tap dashboard.',
            fields: { eyebrow: 'Easy', heading: 'Flexible refills', span: 'single', icon: 'calendar', tint: '#eafbe7' },
          },
          {
            kind: 'feature',
            text: 'Every order plants a tree — 42,918 and counting with your help.',
            imageUrl: 'https://cdn.example.com/features/tree.jpg',
            fields: { eyebrow: 'Good', heading: 'Plant a tree', span: 'wide', icon: 'leaf', tint: '#eafbe7' },
          },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'loose', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'center' },
        colors: { text: '#2b2440', background: '#fffdf9', border: '#f0e9ff', seed: '#7c5cff', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'xl', borderWidth: 'none', shadow: 'md', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
      },
    },
  },

  // 06 — Feature COLUMNS: even 3-up, icon-over-copy, tech-utility grammar (hairline, dense).
  {
    id: 'NSEC-BENTO-06',
    name: 'Feature Columns — 3-Up Icon Row',
    description:
      'Even three-up feature columns with an icon over heading and copy — a crisp, high-trust value-prop row for a homepage, product, or landing page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'feature-columns', 'features', 'grid', 'value-props', 'tech-utility'],
    spec: {
      type: 'theme.section',
      name: 'Feature Columns — 3-Up',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'feature',
        activation: 'section',
        title: 'Everything included',
        subtitle: 'Standard on every plan',
        layout: { layout: 'grid', columns: 3 },
        fields: {
          columnsDesktop: 3,
          columnsMobile: 1,
          groupHover: false,
          iconPosition: 'top',
        },
        blocks: [
          {
            kind: 'feature',
            text: 'SSO, SCIM, and audit logs on every seat — security is not an upsell.',
            fields: { heading: 'Enterprise security', icon: 'lock', span: 'single' },
          },
          {
            kind: 'feature',
            text: '99.99% uptime backed by a public status page and a paid-out SLA.',
            fields: { heading: '99.99% uptime', icon: 'activity', span: 'single' },
          },
          {
            kind: 'feature',
            text: 'A documented REST + GraphQL API and webhooks for everything you can click.',
            fields: { heading: 'Open API', icon: 'code', span: 'single' },
          },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'product', 'page'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'compact' },
        typography: { size: 'MD', weight: 'medium', lineHeight: 'normal', align: 'left' },
        colors: { text: '#e5e7eb', background: '#0d1117', border: '#1f2630', seed: '#3b82f6', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'sm', borderWidth: 'thin', shadow: 'none', elevation: 'border' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'mechanical' },
      },
    },
  },

  // 07 — Feature COLUMNS: 4-up compact grid, inline icon + copy, Apple-HIG clean.
  {
    id: 'NSEC-BENTO-07',
    name: 'Feature Columns — 4-Up Compact',
    description:
      'Compact four-up feature columns with an inline icon and one-line copy — a scannable "the essentials" strip for a homepage or collection page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'feature-columns', 'features', 'grid', 'value-props', 'apple-hig'],
    spec: {
      type: 'theme.section',
      name: 'Feature Columns — 4-Up Compact',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'feature',
        activation: 'section',
        title: 'The essentials',
        subtitle: 'What every order comes with',
        layout: { layout: 'grid', columns: 4 },
        fields: {
          columnsDesktop: 4,
          columnsMobile: 2,
          groupHover: false,
          iconPosition: 'inline',
        },
        blocks: [
          { kind: 'feature', text: 'Free 2-day shipping over $50.', fields: { heading: 'Free shipping', icon: 'truck', span: 'single' } },
          { kind: 'feature', text: '30-day, no-questions returns.', fields: { heading: 'Easy returns', icon: 'refresh', span: 'single' } },
          { kind: 'feature', text: 'Checkout is encrypted end to end.', fields: { heading: 'Secure checkout', icon: 'lock', span: 'single' } },
          { kind: 'feature', text: 'Same-day human support.', fields: { heading: 'Real support', icon: 'chat', span: 'single' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'collection', 'cart'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'container', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'SM', weight: 'medium', lineHeight: 'normal', align: 'center' },
        colors: { text: '#111827', background: '#ffffff', border: '#e5e7eb', seed: '#111827', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'md', borderWidth: 'thin', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'fast', easing: 'standard' },
      },
    },
  },

  // 08 — Feature COLUMNS as a horizontal carousel (mobile-first scroll-snap row of tiles).
  {
    id: 'NSEC-BENTO-08',
    name: 'Feature Columns — Scroll Carousel',
    description:
      'Feature tiles as a horizontal scroll-snap carousel — a mobile-first, swipeable "here is why" row for a homepage or product page.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'grid',
    tags: ['section', 'feature-columns', 'features', 'carousel', 'mobile', 'bold-dtc'],
    spec: {
      type: 'theme.section',
      name: 'Feature Columns — Carousel',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'feature',
        activation: 'section',
        title: 'Here is why',
        subtitle: 'Swipe through what makes it better',
        layout: { layout: 'carousel' },
        fields: {
          columnsMobile: 1,
          peekNextCard: true,
          groupHover: false,
          snap: true,
        },
        blocks: [
          {
            kind: 'feature',
            text: 'Cold-pressed within four hours of harvest so nothing oxidises.',
            imageUrl: 'https://cdn.example.com/features/coldpress.jpg',
            fields: { eyebrow: 'Fresh', heading: 'Cold-pressed fresh', span: 'single' },
          },
          {
            kind: 'feature',
            text: 'No added sugar, ever — the sweetness is the fruit doing its job.',
            imageUrl: 'https://cdn.example.com/features/nosugar.jpg',
            fields: { eyebrow: 'Clean', heading: 'Zero added sugar', span: 'single' },
          },
          {
            kind: 'feature',
            text: 'Glass bottles, returnable for a deposit — the loop stays closed.',
            imageUrl: 'https://cdn.example.com/features/glass.jpg',
            fields: { eyebrow: 'Circular', heading: 'Returnable glass', span: 'single' },
          },
          {
            kind: 'feature',
            text: 'Delivered chilled to your door on the day you choose.',
            imageUrl: 'https://cdn.example.com/features/delivery.jpg',
            fields: { eyebrow: 'Delivered', heading: 'Chilled delivery', span: 'single' },
          },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'product'] as PlaceableTemplate[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'medium', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'LG', weight: 'bold', lineHeight: 'normal', align: 'left' },
        colors: { text: '#0f172a', background: '#fff7ed', border: '#fed7aa', seed: '#ea580c', overlayBackdropOpacity: 0.45 },
        shape: { radius: 'lg', borderWidth: 'thin', shadow: 'md', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'standard' },
      },
    },
  },
];

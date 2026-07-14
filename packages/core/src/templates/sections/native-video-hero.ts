import type { TemplateEntry } from '../types.js';
import { THEME_PLACEABLE_TEMPLATES } from '../../allowed-values.js';

type PlaceTpl = (typeof THEME_PLACEABLE_TEMPLATES)[number];

/**
 * NSEC-VHERO — V-A A5: VIDEO HERO WITH OVERLAY (GemPages / PageFly-class).
 *
 * recipeType = `theme.section`, kind `hero` (→ `hero` archetype, overlay variant).
 * The hero archetype reads `config.fields.videoUrl`: an mp4 URL renders a
 * `<video>` (poster fallback = backgroundImageUrl/posterImageUrl, muted+loop+
 * playsinline, autoplay opt-in); a YouTube/Vimeo WATCH url renders a
 * privacy-enhanced lite embed (youtube-nocookie / player.vimeo.com dnt, id parsed
 * server-side in Liquid, loading=lazy). `overlayOpacity` (0–1) drives the scrim;
 * heading/CTA layer above it. REDUCED MOTION: pure CSS can't strip a `<video autoplay>`
 * attribute, so the runtime pauses autoplaying hero videos when
 * prefers-reduced-motion is set (the poster stays visible); iframe embeds only
 * autoplay when opted in, click-to-play otherwise.
 *
 * A7 device pack is exercised on template 01 (a heavy cinematic mp4 hidden on
 * mobile to save data — device.mobile:false → the module-root sa-hide-mobile class).
 */
export const NATIVE_VIDEO_HERO_TEMPLATES: TemplateEntry[] = [
  // 01 — mp4 product film, minimal-luxe, desktop-only (data-saving on mobile).
  {
    id: 'NSEC-VHERO-01',
    name: 'Product Film Video Hero (Luxe)',
    description: 'Full-bleed autoplaying product-film hero — a muted, looping mp4 behind an elegant headline and shop CTA, with a soft scrim for legibility. Shown on desktop only so mobile shoppers are not served the heavy video.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'video', 'mp4', 'overlay', 'cinematic', 'gempages'],
    spec: {
      type: 'theme.section',
      name: 'Product Film Video Hero',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'Made to move with you',
        subtitle: 'A 60-second look at the craft behind every stitch.',
        layout: { layout: 'stacked' },
        device: { desktop: true, mobile: false },
        fields: {
          videoUrl: 'https://cdn.example.com/media/product-film.mp4',
          posterImageUrl: 'https://cdn.example.com/media/product-film-poster.jpg',
          overlayOpacity: 0.45,
          autoplay: true,
          loop: true,
          muted: true,
          eyebrow: 'The Winter Edit',
        },
        blocks: [
          { kind: 'cta', text: 'Shop the film', url: 'https://example.com/collections/winter', fields: { style: 'primary' } },
        ],
      },
      placement: { enabled_on: { templates: ['index'] as PlaceTpl[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'none', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'medium', lineHeight: 'tight', align: 'center' },
        colors: { overlayBackdropOpacity: 0.45, seed: '#1c1917' },
        shape: { radius: 'lg', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'slow', easing: 'enter' },
        pack: 'luxe',
      },
    },
  },

  // 02 — YouTube brand-story hero, bold DTC, click-to-play privacy embed.
  {
    id: 'NSEC-VHERO-02',
    name: 'Brand Story Video Hero (YouTube, Bold)',
    description: 'Bold brand-story hero backed by a privacy-enhanced YouTube embed (no-cookie, lazy-loaded) with a punchy headline, supporting line and dual CTAs over a dark scrim. Click-to-play by default so it never autoplays motion or eats data.',
    category: 'STOREFRONT_UI',
    type: 'theme.section',
    icon: 'hero',
    tags: ['section', 'hero', 'video', 'youtube', 'overlay', 'brand-story', 'pagefly'],
    spec: {
      type: 'theme.section',
      name: 'Brand Story Video Hero',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'hero',
        activation: 'section',
        title: 'This is why we build',
        subtitle: 'Two founders, one workshop, and a decade of obsession.',
        layout: { layout: 'stacked' },
        fields: {
          videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
          backgroundImageUrl: 'https://cdn.example.com/media/brand-story-poster.jpg',
          overlayOpacity: 0.55,
          autoplay: false,
          eyebrow: 'Our Story',
        },
        blocks: [
          { kind: 'cta', text: 'Meet the makers', url: 'https://example.com/pages/about', fields: { style: 'primary' } },
          { kind: 'cta', text: 'Shop bestsellers', url: 'https://example.com/collections/bestsellers', fields: { style: 'secondary' } },
        ],
      },
      placement: { enabled_on: { templates: ['index', 'page'] as PlaceTpl[] } },
      style: {
        layout: { mode: 'inline', anchor: 'top', offsetX: 0, offsetY: 0, width: 'full', zIndex: 'base' },
        spacing: { padding: 'none', margin: 'none', gap: 'medium', density: 'comfortable' },
        typography: { size: 'XL', weight: 'bold', lineHeight: 'tight', align: 'center' },
        colors: { overlayBackdropOpacity: 0.55, seed: '#7c3aed' },
        shape: { radius: 'none', borderWidth: 'none', shadow: 'none', elevation: 'soft' },
        responsive: { hideOnMobile: false, hideOnDesktop: false },
        accessibility: { focusVisible: true, reducedMotion: true },
        motion: { duration: 'base', easing: 'enter' },
        pack: 'bold',
      },
    },
  },
];

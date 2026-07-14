/**
 * Barrel for the NATIVE-SECTION template library.
 *
 * Aggregates every unit file's canonical `*_TEMPLATES` array into
 * `SECTION_TEMPLATES`. These are full-width native Liquid sections — `theme.section`
 * recipes whose `config.activation === 'section'`, compiled to the native-section
 * Liquid mode (Theme Edit API push) and placeable as a full page section (hero,
 * feature bento, testimonials, pricing, FAQ, gallery, stats/CTA, collection grid,
 * PDP full-section, newsletter, contact/team/timeline, logo marquee, launch/404).
 */
import type { TemplateEntry } from '../types.js';

import { NATIVE_COLLECTION_EDITORIAL_TEMPLATES } from './native-collection-editorial.js';
import { NATIVE_CONTACT_TEAM_TIMELINE_TEMPLATES } from './native-contact-team-timeline.js';
import { NATIVE_FAQ_ACCORDION_TEMPLATES } from './native-faq-accordion.js';
import { NATIVE_FEATURE_BENTO_TEMPLATES } from './native-feature-bento.js';
import { NATIVE_GALLERY_LOOKBOOK_TEMPLATES } from './native-gallery-lookbook.js';
import { NATIVE_HERO_TEMPLATES } from './native-hero.js';
import { NATIVE_LAUNCH_404_TEMPLATES } from './native-launch-404.js';
import { NATIVE_LOGO_MARQUEE_TRUST_TEMPLATES } from './native-logo-marquee-trust.js';
import { NEWSLETTER_CAPTURE_SECTION_TEMPLATES } from './native-newsletter-capture.js';
import { NSEC_PDP_TEMPLATES } from './native-pdp-fullsection.js';
import { NATIVE_PRICING_COMPARISON_TEMPLATES } from './native-pricing-comparison.js';
import { NATIVE_STATS_CTA_BAND_TEMPLATES } from './native-stats-cta-band.js';
import { NATIVE_STOCK_COUNTER_TEMPLATES } from './native-stock-counter.js';
import { NATIVE_TESTIMONIALS_SOCIAL_PROOF_TEMPLATES } from './native-testimonials-social-proof.js';
import { NATIVE_UGC_GRID_TEMPLATES } from './native-ugc-grid.js';
import { NATIVE_VIDEO_HERO_TEMPLATES } from './native-video-hero.js';

export const SECTION_TEMPLATES: TemplateEntry[] = [
  ...NATIVE_COLLECTION_EDITORIAL_TEMPLATES,
  ...NATIVE_CONTACT_TEAM_TIMELINE_TEMPLATES,
  ...NATIVE_FAQ_ACCORDION_TEMPLATES,
  ...NATIVE_FEATURE_BENTO_TEMPLATES,
  ...NATIVE_GALLERY_LOOKBOOK_TEMPLATES,
  ...NATIVE_HERO_TEMPLATES,
  ...NATIVE_LAUNCH_404_TEMPLATES,
  ...NATIVE_LOGO_MARQUEE_TRUST_TEMPLATES,
  ...NEWSLETTER_CAPTURE_SECTION_TEMPLATES,
  ...NSEC_PDP_TEMPLATES,
  ...NATIVE_PRICING_COMPARISON_TEMPLATES,
  ...NATIVE_STATS_CTA_BAND_TEMPLATES,
  ...NATIVE_STOCK_COUNTER_TEMPLATES,
  ...NATIVE_TESTIMONIALS_SOCIAL_PROOF_TEMPLATES,
  ...NATIVE_UGC_GRID_TEMPLATES,
  ...NATIVE_VIDEO_HERO_TEMPLATES,
];

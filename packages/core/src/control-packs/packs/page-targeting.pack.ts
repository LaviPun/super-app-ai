/**
 * `page-targeting` control pack — where a storefront module is allowed to appear.
 * Reuses THEME_PLACEABLE_TEMPLATES and POPUP_SHOW_ON_PAGES so the vocabulary stays
 * aligned with placement validation and the existing popup `showOnPages` field.
 */
import { z } from 'zod';
import { THEME_PLACEABLE_TEMPLATES, POPUP_SHOW_ON_PAGES, LIMITS } from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

const DEVICES = ['mobile', 'tablet', 'desktop'] as const;

export const PageTargetingPackSchema = z.object({
  /** High-level page bucket (homepage/collection/product/cart/all/custom). */
  pages: z.enum(POPUP_SHOW_ON_PAGES).default('ALL'),
  /** Fine-grained allow-list of theme templates. Empty = no template restriction. */
  templates: z.array(z.enum(THEME_PLACEABLE_TEMPLATES)).max(THEME_PLACEABLE_TEMPLATES.length).default([]),
  /** URL substrings the page must include (for pages='CUSTOM'). */
  urlIncludes: z.array(z.string().max(LIMITS.popupCustomPageUrlMax)).max(LIMITS.popupCustomPageUrlsMax).default([]),
  /** URL substrings that exclude a page even if otherwise matched. */
  urlExcludes: z.array(z.string().max(LIMITS.popupCustomPageUrlMax)).max(LIMITS.popupCustomPageUrlsMax).default([]),
  /** Device classes the module is allowed on. Empty = all devices. */
  devices: z.array(z.enum(DEVICES)).max(DEVICES.length).default([]),
  /** ISO country codes to restrict to (empty = all). */
  countries: z.array(z.string().min(2).max(2)).max(50).default([]),
});

export const pageTargetingPack: ControlPack<typeof PageTargetingPackSchema> = {
  id: 'page-targeting',
  namespace: 'targeting',
  label: 'Page Targeting',
  tier: 'basic',
  schema: PageTargetingPackSchema,
  uiSchema: {
    groupLabel: 'Where it shows',
    order: ['pages', 'templates', 'urlIncludes', 'urlExcludes', 'devices', 'countries'],
    fields: {
      urlIncludes: { showWhen: { field: 'pages', equals: 'CUSTOM' } },
      urlExcludes: { tier: 'advanced' },
      devices: { tier: 'advanced' },
      countries: { tier: 'advanced' },
    },
  },
};

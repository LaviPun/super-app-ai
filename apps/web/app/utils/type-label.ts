/**
 * Module type display: human-readable label and Polaris Badge tone.
 * e.g. theme.section -> "Theme section", customerAccount.blocks -> "Customer account blocks"
 */

import type { WcTone } from '~/components/merchant/polaris';

const CATEGORY_LABEL: Record<string, string> = {
  STOREFRONT_UI: 'Storefront UI',
  ADMIN_UI: 'Admin UI',
  FUNCTION: 'Function',
  INTEGRATION: 'Integration',
  FLOW: 'Flow',
  CUSTOMER_ACCOUNT: 'Customer Account',
};

/**
 * The six raw library categories, in display order. Single source of truth for
 * the category filter pills across the templates and modules routes. Mirrors
 * `MODULE_CATEGORIES` in @superapp/core.
 */
export const CATEGORY_ORDER = [
  'STOREFRONT_UI',
  'ADMIN_UI',
  'CUSTOMER_ACCOUNT',
  'FUNCTION',
  'INTEGRATION',
  'FLOW',
] as const;

/**
 * Badge/thumbnail tone per raw category. Only tones with a matching
 * `--p-<tone>-bg` CSS var are used (info, success, warning, magic) so the
 * gallery thumbnails keep a valid background. Colors are decorative category
 * chips — Storefront/Admin share the neutral blue and Customer Account/Flow
 * share green; the icon disambiguates.
 */
const CATEGORY_TONE: Record<string, string> = {
  STOREFRONT_UI: 'info',
  ADMIN_UI: 'info',
  CUSTOMER_ACCOUNT: 'success',
  FUNCTION: 'warning',
  INTEGRATION: 'magic',
  FLOW: 'success',
};

/** Icon name (from the superapp Icon set) per raw category. */
const CATEGORY_ICON: Record<string, string> = {
  STOREFRONT_UI: 'desktop',
  ADMIN_UI: 'settings',
  CUSTOMER_ACCOUNT: 'users',
  FUNCTION: 'bolt',
  INTEGRATION: 'connect',
  FLOW: 'flow',
};

/** Returns a human-readable label for a category constant. e.g. "STOREFRONT_UI" -> "Storefront UI" */
export function getCategoryDisplayLabel(category: string): string {
  if (!category || typeof category !== 'string') return category ?? '';
  return CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Returns the decorative Badge/thumbnail tone for a raw category. Defaults to 'info'. */
export function getCategoryTone(category: string): string {
  if (!category || typeof category !== 'string') return 'info';
  return CATEGORY_TONE[category] ?? 'info';
}

/** Returns the Icon name for a raw category. Defaults to 'layers'. */
export function getCategoryIcon(category: string): string {
  if (!category || typeof category !== 'string') return 'layers';
  return CATEGORY_ICON[category] ?? 'layers';
}

/*
 * Category → Polaris badge tone / icon (WS-I dedupe — was duplicated
 * byte-for-byte across modules._index.tsx, modules.$moduleId.tsx, and
 * templates._index.tsx, see docs/superpowers/plans/2026-08-24-ws-i-cleanup.md
 * Task 19). `getCategoryTone`/`getCategoryIcon` above still speak the
 * vendored palette ('magic' has no Polaris badge equivalent → 'caution').
 */
const CAT_BADGE_TONE: Record<string, WcTone> = { info: 'info', success: 'success', warning: 'warning', magic: 'caution' };
export function catTone(category: string): WcTone {
  return CAT_BADGE_TONE[getCategoryTone(category)] ?? 'neutral';
}

const CAT_ICON: Record<string, string> = { desktop: 'desktop', settings: 'settings', users: 'team', bolt: 'bolt', connect: 'connect', flow: 'automation' };
export function catIcon(category: string): string {
  return CAT_ICON[getCategoryIcon(category)] ?? 'layer';
}

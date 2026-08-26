/**
 * Module type display: human-readable label and Polaris Badge tone.
 * e.g. theme.section -> "Theme section", customerAccount.blocks -> "Customer account blocks"
 */

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

/**
 * Module type display: human-readable label and Polaris Badge tone.
 * e.g. theme.banner -> "Theme banner", customerAccount.blocks -> "Customer account blocks"
 */

export type TypeBadgeTone =
  | 'info'
  | 'success'
  | 'warning'
  | 'attention'
  | 'critical'
  | 'new';

const SMALL_WORDS = new Set(['and', 'or', 'the', 'of', 'for', 'to', 'in', 'on']);

/** Converts camelCase to readable sentence-style, e.g. "cartAndCheckoutValidation" -> "Cart and checkout validation" */
function humanizeCamel(str: string): string {
  if (!str) return str;
  const withSpaces = str.replace(/([A-Z])/g, ' $1').trim();
  return withSpaces
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Namespace prefix to human label (with trailing space if used before suffix). Empty for functions (suffix only). */
const NAMESPACE_LABEL: Record<string, string> = {
  theme: 'Theme ',
  functions: '', // e.g. "Cart and checkout validation" with no prefix
  customerAccount: 'Customer account ',
  checkout: 'Checkout ',
  flow: 'Flow ',
  integration: 'Integration ',
  platform: 'Platform ',
  proxy: 'Proxy ',
};

/**
 * Returns a human-readable label for the module type (sentence-style).
 * theme.banner -> "Theme banner"
 * functions.cartAndCheckoutValidation -> "Cart and checkout validation"
 * customerAccount.blocks -> "Customer account blocks"
 */
export function getTypeDisplayLabel(fullType: string): string {
  if (!fullType || typeof fullType !== 'string') return fullType ?? '';
  const trimmed = fullType.trim();
  const parts = trimmed.split('.');
  const prefix = parts[0] ?? '';
  const suffix = parts[parts.length - 1] ?? trimmed;
  const namespace = NAMESPACE_LABEL[prefix] ?? prefix ? humanizeCamel(prefix) + ' ' : '';
  const suffixLabel = humanizeCamel(suffix);
  return (namespace + suffixLabel).trim() || trimmed;
}

const CATEGORY_LABEL: Record<string, string> = {
  STOREFRONT_UI: 'Storefront UI',
  ADMIN_UI: 'Admin UI',
  FUNCTION: 'Function',
  INTEGRATION: 'Integration',
  FLOW: 'Flow',
  CUSTOMER_ACCOUNT: 'Customer Account',
};

/** Returns a human-readable label for a category constant. e.g. "STOREFRONT_UI" -> "Storefront UI" */
export function getCategoryDisplayLabel(category: string): string {
  if (!category || typeof category !== 'string') return category ?? '';
  return CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Returns the last segment only (kept for URL/keys). e.g. "theme.banner" -> "banner" */
export function getTypeShortLabel(fullType: string): string {
  if (!fullType || typeof fullType !== 'string') return fullType ?? '';
  const parts = fullType.trim().split('.');
  return parts[parts.length - 1] ?? fullType;
}

/** Returns a consistent Badge tone for the type based on its namespace (prefix). */
export function getTypeTone(fullType: string): TypeBadgeTone {
  if (!fullType || typeof fullType !== 'string') return 'info';
  const prefix = fullType.split('.')[0] ?? '';
  switch (prefix) {
    case 'theme':
      return 'info';
    case 'functions':
      return 'warning';
    case 'customerAccount':
      return 'success';
    case 'checkout':
      return 'attention';
    case 'flow':
      return 'new';
    case 'integration':
      return 'critical';
    case 'platform':
    case 'proxy':
    default:
      return 'info';
  }
}

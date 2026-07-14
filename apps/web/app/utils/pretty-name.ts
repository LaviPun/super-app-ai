/**
 * Turn a shop domain into a human-readable store name.
 * e.g. "acme-store.myshopify.com" -> "Acme Store"
 */
export function prettyName(domain: string): string {
  return (domain.split('.')[0] ?? domain).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

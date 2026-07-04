/**
 * Agentic catalog-profile feed — PURE projection (M13).
 *
 * The deterministic "raw product node → feed item" projection, isolated from the
 * DB/admin-client wiring in `feed.server.ts` so it is unit-testable with no session.
 * Only PUBLIC product fields are projected — no PII. `attributeMap` resolves
 * best-effort (unresolved keys are OMITTED, never emitted as null); `disclosures`
 * are appended verbatim.
 */
import type { RecipeSpec } from '@superapp/core';

/** Parsed config of a published agentic.catalogProfile module. */
export type AgenticFeedConfig = {
  /** Stable module id (the published Module row id). */
  moduleId: string;
  /** Merchant-facing module name. */
  name: string;
  /** Public feed handle (URL slug). */
  feedHandle: string;
  /** Which artifacts the module produces (only the shipped ones affect the feed). */
  artifacts: Extract<RecipeSpec, { type: 'agentic.catalogProfile' }>['config']['artifacts'];
  /** Which product set the feed syndicates. */
  source: Extract<RecipeSpec, { type: 'agentic.catalogProfile' }>['config']['source'];
  /** Normalized attribute → product-field mappings. */
  attributeMap: Extract<RecipeSpec, { type: 'agentic.catalogProfile' }>['config']['attributeMap'];
  /** Disclosures appended verbatim to every feed item. */
  disclosures: Extract<RecipeSpec, { type: 'agentic.catalogProfile' }>['config']['disclosures'];
  /** sponsored-products: promoted product GIDs boosted in agentic (MCP/feed) results. */
  sponsoredProductIds: string[];
  /** agent-profile: public free-text instructions surfaced to AI agents. */
  agentInstructions?: string;
};

/** A single product row emitted in the feed. Product data only — no PII. */
export type AgenticFeedItem = {
  id: string;
  title: string;
  description: string;
  url: string;
  price: string | null;
  currency: string | null;
  availability: 'in_stock' | 'out_of_stock';
  images: string[];
  /** Normalized attributes resolved from attributeMap (unresolved keys omitted). */
  attributes: Record<string, string>;
  /** True when this item is a merchant-promoted (sponsored) product. */
  sponsored?: boolean;
};

/** Raw product node shape the admin query returns (subset we project). */
export type RawProductNode = {
  id: string;
  title: string;
  handle: string;
  description?: string | null;
  vendor?: string | null;
  productType?: string | null;
  onlineStoreUrl?: string | null;
  tags?: string[] | null;
  priceRangeV2?: { minVariantPrice?: { amount?: string; currencyCode?: string } } | null;
  totalInventory?: number | null;
  featuredImage?: { url?: string | null } | null;
  images?: { nodes?: Array<{ url?: string | null }> } | null;
  metafields?: { nodes?: Array<{ namespace?: string; key?: string; value?: string }> } | null;
  variants?: { nodes?: Array<Record<string, unknown>> } | null;
};

/** Project a raw product node into a feed item — PUBLIC fields only, attributeMap + disclosures applied. */
export function projectFeedItem(
  n: RawProductNode,
  cfg: AgenticFeedConfig,
  shopDomain: string,
): AgenticFeedItem {
  const price = n.priceRangeV2?.minVariantPrice;
  const images = [
    ...(n.featuredImage?.url ? [n.featuredImage.url] : []),
    ...((n.images?.nodes ?? []).map((i) => i?.url).filter((u): u is string => !!u)),
  ];
  const dedupImages = [...new Set(images)];

  const attributes: Record<string, string> = {};
  if (cfg.artifacts.includes('attribute-map')) {
    for (const row of cfg.attributeMap) {
      const resolved = resolveAttribute(n, row.from);
      if (resolved != null && resolved !== '') attributes[row.key] = resolved;
    }
  }
  // Disclosures are appended verbatim (compliance-disclosure artifact).
  if (cfg.artifacts.includes('compliance-disclosure')) {
    for (const d of cfg.disclosures) attributes[`disclosure:${d.label}`] = d.text;
  }

  return {
    id: n.id,
    title: n.title,
    description: n.description ?? '',
    url: n.onlineStoreUrl ?? `https://${shopDomain}/products/${n.handle}`,
    price: price?.amount ?? null,
    currency: price?.currencyCode ?? null,
    availability: (n.totalInventory ?? 0) > 0 ? 'in_stock' : 'out_of_stock',
    images: dedupImages,
    attributes,
  };
}

/**
 * Resolve an attributeMap `from` path against a product node. Supported forms:
 *  - `metafield:<ns>.<key>`  → the matching metafield's value
 *  - `variant.<field>`       → the first variant's field (e.g. sku, barcode)
 *  - a bare top-level field  → vendor | productType | title | handle | description
 * Unknown/unresolved → `undefined` (the row is OMITTED, never emitted as null).
 */
export function resolveAttribute(n: RawProductNode, from: string): string | undefined {
  if (from.startsWith('metafield:')) {
    const path = from.slice('metafield:'.length);
    const dot = path.indexOf('.');
    if (dot < 0) return undefined;
    const ns = path.slice(0, dot);
    const key = path.slice(dot + 1);
    const mf = (n.metafields?.nodes ?? []).find((m) => m?.namespace === ns && m?.key === key);
    return mf?.value ?? undefined;
  }
  if (from.startsWith('variant.')) {
    const field = from.slice('variant.'.length);
    const v = n.variants?.nodes?.[0];
    const val = v?.[field];
    return typeof val === 'string' && val !== '' ? val : undefined;
  }
  switch (from) {
    case 'vendor':
      return n.vendor ?? undefined;
    case 'productType':
      return n.productType ?? undefined;
    case 'title':
      return n.title || undefined;
    case 'handle':
      return n.handle || undefined;
    case 'description':
      return n.description ?? undefined;
    default:
      return undefined;
  }
}

/**
 * sponsored-products: stable-partition `items` so merchant-promoted products (by GID,
 * in the order the merchant listed them) lead the result set, each flagged
 * `sponsored: true`. Non-sponsored items keep their original relative order. Only
 * applies when the `sponsored-products` artifact is enabled AND ids are configured;
 * otherwise the input is returned unchanged (no `sponsored` flag added).
 *
 * Pure and deterministic — no DB/network — so it is unit-testable and identical whether
 * invoked from the feed route or the MCP search tool.
 */
export function applySponsoredRanking(
  items: AgenticFeedItem[],
  cfg: Pick<AgenticFeedConfig, 'artifacts' | 'sponsoredProductIds'>,
): AgenticFeedItem[] {
  if (!cfg.artifacts.includes('sponsored-products')) return items;
  const promoted = cfg.sponsoredProductIds ?? [];
  if (promoted.length === 0) return items;

  const rank = new Map(promoted.map((id, i) => [id, i]));
  const sponsored: AgenticFeedItem[] = [];
  const rest: AgenticFeedItem[] = [];
  for (const it of items) {
    if (rank.has(it.id)) sponsored.push({ ...it, sponsored: true });
    else rest.push(it);
  }
  // Order sponsored items by the merchant's configured sequence, ties broken by input order.
  sponsored.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...sponsored, ...rest];
}

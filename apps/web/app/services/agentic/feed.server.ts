/**
 * Agentic catalog-profile feed reader (M13).
 *
 * A published `agentic.catalogProfile` module is a structured product-data feed the
 * merchant surfaces to AI channels. AI crawlers/agents have NO session, so — exactly
 * like the POS block reads its config from the app backend (pos-config.server.ts) —
 * this feed is served from THIS app's backend: the public route
 * `/agentic/{shop}/{handle}/feed.json` calls `readPublishedAgenticFeed` to load the
 * active PUBLISHED module config, then `resolveFeedItems` projects the shop's
 * products into the feed (attributeMap applied, disclosures appended).
 *
 * The source of truth is the same one every other surface publishes to: a module's
 * PUBLISHED `ModuleVersion` (its persisted `RecipeSpec`). No placeholder/demo data —
 * an unconfigured shop / unknown handle yields `null` (the no-placeholder fence,
 * matching the POS reader). Only PUBLIC product data is projected — no PII.
 */
import type { PrismaClient } from '@prisma/client';
import { RecipeSpecSchema, type RecipeSpec } from '@superapp/core';
import { shopify } from '~/shopify.server';
import {
  projectFeedItem,
  type AgenticFeedConfig,
  type AgenticFeedItem,
  type RawProductNode,
} from './feed-projection';

export type { AgenticFeedConfig, AgenticFeedItem, RawProductNode } from './feed-projection';

/** Narrow a parsed RecipeSpec to the agentic.catalogProfile variant. */
function isAgenticSpec(
  spec: RecipeSpec,
): spec is Extract<RecipeSpec, { type: 'agentic.catalogProfile' }> {
  return spec.type === 'agentic.catalogProfile';
}

/**
 * Read the active PUBLISHED `agentic.catalogProfile` module for a shop whose
 * `config.feedHandle` matches `feedHandle`. Returns `null` when the shop has no
 * matching published feed (no placeholder — same fence as the POS reader).
 */
export async function readPublishedAgenticFeed(
  prisma: PrismaClient,
  shopDomain: string,
  feedHandle: string,
): Promise<AgenticFeedConfig | null> {
  const modules = await prisma.module.findMany({
    where: {
      type: 'agentic.catalogProfile',
      status: 'PUBLISHED',
      shop: { shopDomain },
    },
    include: { activeVersion: true },
    orderBy: { updatedAt: 'desc' },
  });

  for (const mod of modules) {
    const version = mod.activeVersion;
    // Only surface a module whose active version is genuinely published.
    if (!version || version.status !== 'PUBLISHED' || !version.specJson) continue;

    let spec: RecipeSpec;
    try {
      const parsed = RecipeSpecSchema.safeParse(JSON.parse(version.specJson));
      if (!parsed.success) continue;
      spec = parsed.data;
    } catch {
      // Skip malformed persisted specs rather than failing the whole response.
      continue;
    }
    if (!isAgenticSpec(spec)) continue;
    if (spec.config.feedHandle !== feedHandle) continue;

    return {
      moduleId: mod.id,
      name: mod.name,
      feedHandle: spec.config.feedHandle,
      artifacts: spec.config.artifacts,
      source: spec.config.source,
      attributeMap: spec.config.attributeMap,
      disclosures: spec.config.disclosures,
    };
  }

  return null;
}

// ── Product resolution (offline admin client, product-data only) ──────────────

/** Max products emitted per feed response (bounded read at crawl time; R1). */
const FEED_PRODUCT_CAP = 250;

const PRODUCT_FIELDS = `#graphql
  fragment AgenticProduct on Product {
    id
    title
    handle
    description
    vendor
    productType
    onlineStoreUrl
    tags
    priceRangeV2 { minVariantPrice { amount currencyCode } }
    totalInventory
    featuredImage { url }
    images(first: 5) { nodes { url } }
    metafields(first: 25) { nodes { namespace key value } }
    variants(first: 1) { nodes { sku barcode } }
  }
`;

type AdminGraphql = (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;

/**
 * Resolve the feed's product rows for a shop. Uses the app's OFFLINE admin client
 * (an AI crawler has no session), the same client the theme/recommendation resolvers
 * use. Bounded read (`FEED_PRODUCT_CAP`); projects PUBLIC product fields only, applies
 * `attributeMap`, and appends `disclosures` verbatim as attributes.
 *
 * Returns `[]` when the offline admin session is unavailable — the route still emits a
 * valid (empty) feed rather than 500ing an unauthenticated crawler.
 */
export async function resolveFeedItems(
  cfg: AgenticFeedConfig,
  shopDomain: string,
): Promise<AgenticFeedItem[]> {
  let graphql: AdminGraphql;
  try {
    const ctx = await shopify.unauthenticated.admin(shopDomain);
    graphql = ctx.admin.graphql as unknown as AdminGraphql;
  } catch {
    return [];
  }

  const nodes = await fetchProductNodes(graphql, cfg.source);
  return nodes.slice(0, FEED_PRODUCT_CAP).map((n) => projectFeedItem(n, cfg, shopDomain));
}

async function fetchProductNodes(
  graphql: AdminGraphql,
  source: AgenticFeedConfig['source'],
): Promise<RawProductNode[]> {
  try {
    if (source.kind === 'manual' && source.productIds && source.productIds.length > 0) {
      const query = `#graphql
        ${PRODUCT_FIELDS}
        query AgenticManual($ids: [ID!]!) {
          nodes(ids: $ids) { ... on Product { ...AgenticProduct } }
        }
      `;
      const res = await graphql(query, { variables: { ids: source.productIds.slice(0, FEED_PRODUCT_CAP) } });
      const body = (await res.json()) as { data?: { nodes?: Array<RawProductNode | null> } };
      return (body.data?.nodes ?? []).filter((n): n is RawProductNode => !!n && !!n.id);
    }

    if (source.kind === 'collection' && source.collectionIds && source.collectionIds.length > 0) {
      const query = `#graphql
        ${PRODUCT_FIELDS}
        query AgenticCollection($id: ID!, $first: Int!) {
          collection(id: $id) { products(first: $first) { nodes { ...AgenticProduct } } }
        }
      `;
      const out: RawProductNode[] = [];
      for (const id of source.collectionIds) {
        if (out.length >= FEED_PRODUCT_CAP) break;
        const res = await graphql(query, { variables: { id, first: FEED_PRODUCT_CAP } });
        const body = (await res.json()) as {
          data?: { collection?: { products?: { nodes?: RawProductNode[] } } };
        };
        for (const n of body.data?.collection?.products?.nodes ?? []) {
          if (n?.id) out.push(n);
        }
      }
      return out;
    }

    // kind === 'all' (or an under-specified collection/manual): paginated products, bounded.
    const query = `#graphql
      ${PRODUCT_FIELDS}
      query AgenticAll($first: Int!, $after: String) {
        products(first: $first, after: $after, query: "status:active") {
          nodes { ...AgenticProduct }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
    const out: RawProductNode[] = [];
    let after: string | null = null;
    while (out.length < FEED_PRODUCT_CAP) {
      const res = await graphql(query, { variables: { first: Math.min(50, FEED_PRODUCT_CAP - out.length), after } });
      const body = (await res.json()) as {
        data?: { products?: { nodes?: RawProductNode[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } };
      };
      for (const n of body.data?.products?.nodes ?? []) {
        if (n?.id) out.push(n);
      }
      const pageInfo = body.data?.products?.pageInfo;
      if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
      after = pageInfo.endCursor;
    }
    return out;
  } catch {
    return [];
  }
}

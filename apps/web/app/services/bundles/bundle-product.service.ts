/**
 * BundleProductService — the publish-time "connect everything" layer for product
 * bundles. Turns an AI-generated `functions.cartTransform` bundle config (which
 * only knows component SKUs) into a fully wired, deployable bundle:
 *
 *   1. resolve each component SKU → a real ProductVariant GID (+ title/price/image)
 *   2. ensure a parent bundle product/variant exists (idempotent) — the variant
 *      the cart-transform Function merges the components into
 *   3. activate the cart-transform Function with the runtime bundle config written
 *      as the `$app:bundle_config` metafield the Function reads
 *   4. hand back a resolved runtime config the theme + checkout members embed, so
 *      the storefront widget adds the exact variants and stamps the bundle id
 *
 * The merchant only generates the module; this service wires the rest. The pure
 * `buildBundleRuntimeConfig` is unit-tested; the Admin calls run at publish
 * against a live shop (verified in the admin backend).
 *
 * R2.2 pricing bridge: `resolveBundleWithPricing` lowers a bundle's `pricing` block
 * (via the compiler's `lowerPricingToCartTransform`) onto the resolved bundle, and
 * `buildBundleRuntimeConfig` threads that lowered `price`/`tiers` into the same
 * `$app:bundle_config` metafield the wasm handler reads. This is the missing link
 * that lets a module's lowered cart-transform pricing actually reach the running
 * handler — the `superapp-fn-cartTransform` compiler metaobject is a separate config
 * source the live handler never reads. (See `compiler/pricing/lower.ts` and
 * `extensions/superapp-cart-transform/src/cart_transform_run.rs`.)
 */
import type { AdminApiContext } from '~/types/shopify';
import { lowerPricingToCartTransform } from '~/services/recipes/compiler/pricing/lower';
import type { LoweredBundlePrice, LoweredTierPrice } from '~/services/recipes/compiler/pricing/lower';
import type { PricingPack } from '@superapp/core';

type AdminClient = AdminApiContext['admin'];

/** One bundle as declared in a `functions.cartTransform` recipe config. */
export type CartTransformBundleInput = {
  title: string;
  componentSkus: string[];
  bundleSku: string;
  /**
   * R2.2 lowered pricing carried on the bundle at publish. When present, the
   * runtime config that the cart-transform wasm reads is enriched with the
   * lowered `price`/`tiers` shape (see `resolveBundleWithPricing`).
   */
  pricing?: PricingPack;
};

export type ResolvedComponent = {
  sku: string;
  variantId: string;
  title: string;
  priceLabel?: string;
  imageUrl?: string;
};

/** A fully resolved bundle, ready for the Function config + storefront widget. */
export type ResolvedBundle = {
  /** Stable id stamped on every component line (`_superapp_bundle_id`). */
  bundleId: string;
  title: string;
  parentVariantId: string;
  discountPercentage: number;
  components: ResolvedComponent[];
  /**
   * R2.2 lowered single price directive (from `lowerPricingToCartTransform`).
   * When present, it flows verbatim into the `$app:bundle_config` metafield the
   * wasm handler reads, so a module's lowered pricing reaches the runtime.
   */
  price?: LoweredBundlePrice;
  /** R2.2 lowered tiered price table (highest-threshold-first), same source. */
  tiers?: LoweredTierPrice[];
};

/** The shape written to `$app:bundle_config` and read by the cart-transform Function. */
export type BundleFunctionConfig = {
  bundles: Array<{
    bundleId: string;
    parentVariantId: string;
    title: string;
    discountPercentage: number;
    /**
     * R2.2 lowered pricing — omitted when the bundle carries none, so a
     * pricing-free bundle serializes byte-identically to the legacy shape and
     * the wasm handler's back-compat path is unchanged. When present, the wasm
     * handler (`cart_transform_run.rs`) derives the merged-line discount from it.
     */
    price?: LoweredBundlePrice;
    tiers?: LoweredTierPrice[];
  }>;
};

/** Deterministic, URL/handle-safe bundle id from a title (stable across republish). */
export function bundleIdFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'bundle';
}

/**
 * Pure: assemble the Function-readable config from resolved bundles. Kept separate
 * from the Admin calls so it can be unit-tested without a shop.
 *
 * The lowered `price`/`tiers` (R2.2) are threaded through ONLY when present, so a
 * bundle with no lowered pricing serializes to the exact legacy shape and the wasm
 * handler's byte-for-byte back-compat path is preserved.
 */
export function buildBundleRuntimeConfig(bundles: ResolvedBundle[]): BundleFunctionConfig {
  return {
    bundles: bundles.map((b) => {
      const entry: BundleFunctionConfig['bundles'][number] = {
        bundleId: b.bundleId,
        parentVariantId: b.parentVariantId,
        title: b.title,
        discountPercentage: b.discountPercentage,
      };
      if (b.price) entry.price = b.price;
      if (b.tiers && b.tiers.length > 0) entry.tiers = b.tiers;
      return entry;
    }),
  };
}

/**
 * Bridge (R2.2): derive a resolved bundle's lowered `price`/`tiers` from its
 * `pricing` block using the SAME `lowerPricingToCartTransform` the compiler uses,
 * so the config written to `$app:bundle_config` (what the wasm reads) carries the
 * same lowered shape the handler now parses. Returns the bundle augmented with
 * lowered pricing; a bundle with no `pricing` is returned unchanged.
 *
 * This closes the gap where R2.2 pricing lowered onto the `superapp-fn-cartTransform`
 * metaobject never reached the running handler (which reads the `$app:bundle_config`
 * metafield). The runtime config now carries the lowered pricing.
 */
export function resolveBundleWithPricing(
  bundle: ResolvedBundle,
  pricing: PricingPack | undefined,
): ResolvedBundle {
  if (!pricing) return bundle;
  const lowered = lowerPricingToCartTransform(pricing, {
    title: bundle.title,
    componentSkus: bundle.components.map((c) => c.sku),
    bundleSku: bundle.bundleId,
  });
  const next: ResolvedBundle = { ...bundle };
  if (lowered.price) next.price = lowered.price;
  if (lowered.tiers) next.tiers = lowered.tiers;
  return next;
}

const VARIANTS_BY_SKU = `#graphql
  query SuperAppVariantsBySku($query: String!) {
    productVariants(first: 50, query: $query) {
      nodes {
        id
        sku
        title
        price
        product { title featuredMedia { preview { image { url } } } }
      }
    }
  }
`;

const PRODUCT_SET = `#graphql
  mutation SuperAppBundleProductSet($input: ProductSetInput!) {
    productSet(synchronous: true, input: $input) {
      product {
        id
        handle
        variants(first: 1) { nodes { id } }
      }
      userErrors { field message }
    }
  }
`;

const CART_TRANSFORM_CREATE = `#graphql
  mutation SuperAppCartTransformCreate($functionHandle: String!, $metafields: [MetafieldInput!]) {
    cartTransformCreate(functionHandle: $functionHandle, blockOnFailure: false, metafields: $metafields) {
      cartTransform { id }
      userErrors { field message }
    }
  }
`;

const CART_TRANSFORMS_QUERY = `#graphql
  query SuperAppCartTransforms {
    cartTransforms(first: 1) {
      nodes { id }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation SuperAppMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

export class BundleProductService {
  constructor(private readonly admin: AdminClient) {}

  /** Resolve component SKUs → variant GIDs (+ display data). Missing SKUs are skipped. */
  async resolveComponents(skus: string[]): Promise<ResolvedComponent[]> {
    const unique = Array.from(new Set(skus.map((s) => s.trim()).filter(Boolean)));
    if (unique.length === 0) return [];
    const query = unique.map((s) => `sku:${JSON.stringify(s)}`).join(' OR ');
    const res = await this.admin.graphql(VARIANTS_BY_SKU, { variables: { query } });
    const json = (await res.json()) as {
      data?: {
        productVariants?: {
          nodes?: Array<{
            id: string;
            sku?: string | null;
            title?: string | null;
            price?: string | null;
            product?: {
              title?: string | null;
              featuredMedia?: { preview?: { image?: { url?: string | null } | null } | null } | null;
            } | null;
          }>;
        };
      };
    };
    const bySku = new Map<string, ResolvedComponent>();
    for (const node of json?.data?.productVariants?.nodes ?? []) {
      if (!node.sku || bySku.has(node.sku)) continue;
      bySku.set(node.sku, {
        sku: node.sku,
        variantId: node.id,
        title: node.product?.title ?? node.title ?? node.sku,
        priceLabel: node.price ?? undefined,
        imageUrl: node.product?.featuredMedia?.preview?.image?.url ?? undefined,
      });
    }
    // Preserve the requested order, dropping unresolved SKUs.
    return unique.map((s) => bySku.get(s)).filter((c): c is ResolvedComponent => Boolean(c));
  }

  /**
   * Ensure a parent bundle product/variant exists for this bundle. Idempotent by
   * a stable handle (`superapp-bundle-<bundleId>`); productSet creates it on first
   * publish and updates it thereafter. Returns the parent variant GID.
   */
  async ensureParentBundleProduct(args: {
    bundleId: string;
    title: string;
    components: ResolvedComponent[];
  }): Promise<string> {
    const handle = `superapp-bundle-${args.bundleId}`;
    const componentTitles = args.components.map((c) => c.title).join(', ');
    const input = {
      handle,
      title: args.title,
      status: 'ACTIVE',
      descriptionHtml: componentTitles ? `<p>Bundle: ${componentTitles}</p>` : undefined,
      productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
      variants: [{ optionValues: [{ optionName: 'Title', name: 'Default Title' }], sku: handle }],
      tags: ['superapp-bundle'],
    };
    const res = await this.admin.graphql(PRODUCT_SET, { variables: { input } });
    const json = (await res.json()) as {
      data?: {
        productSet?: {
          product?: { variants?: { nodes?: Array<{ id: string }> } };
          userErrors?: Array<{ message: string }>;
        };
      };
    };
    const err = json?.data?.productSet?.userErrors?.[0];
    if (err) throw new Error(`productSet failed: ${err.message}`);
    const variantId = json?.data?.productSet?.product?.variants?.nodes?.[0]?.id;
    if (!variantId) throw new Error('productSet returned no parent variant id');
    return variantId;
  }

  /**
   * Activate the cart-transform Function (idempotent) and write the bundle runtime
   * config to its `$app:bundle_config` metafield. Reuses the app's existing cart
   * transform when present (metafield update), else creates one with the config
   * attached. An app has a single cart transform, so matching the first is safe.
   */
  async activateCartTransform(config: BundleFunctionConfig): Promise<string> {
    const value = JSON.stringify(config);

    const existingRes = await this.admin.graphql(CART_TRANSFORMS_QUERY);
    const existingJson = (await existingRes.json()) as {
      data?: { cartTransforms?: { nodes?: Array<{ id: string }> } };
    };
    const existing = existingJson?.data?.cartTransforms?.nodes?.[0];

    if (existing?.id) {
      await this.setAppJsonMetafield(existing.id, 'bundle_config', value);
      return existing.id;
    }

    const createRes = await this.admin.graphql(CART_TRANSFORM_CREATE, {
      variables: {
        functionHandle: 'cart-transform-function',
        metafields: [{ namespace: '$app', key: 'bundle_config', type: 'json', value }],
      },
    });
    const createJson = (await createRes.json()) as {
      data?: {
        cartTransformCreate?: {
          cartTransform?: { id?: string };
          userErrors?: Array<{ message: string }>;
        };
      };
    };
    const err = createJson?.data?.cartTransformCreate?.userErrors?.[0];
    if (err) throw new Error(`cartTransformCreate failed: ${err.message}`);
    const id = createJson?.data?.cartTransformCreate?.cartTransform?.id;
    if (!id) throw new Error('cartTransformCreate returned no id');
    return id;
  }

  /** Write an app-owned ($app namespace) json metafield on an owner resource. */
  async setAppJsonMetafield(ownerId: string, key: string, value: string): Promise<void> {
    const res = await this.admin.graphql(METAFIELDS_SET, {
      variables: {
        metafields: [{ ownerId, namespace: '$app', key, type: 'json', value }],
      },
    });
    const json = (await res.json()) as {
      data?: { metafieldsSet?: { userErrors?: Array<{ message: string }> } };
    };
    const err = json?.data?.metafieldsSet?.userErrors?.[0];
    if (err) throw new Error(`metafieldsSet failed: ${err.message}`);
  }
}

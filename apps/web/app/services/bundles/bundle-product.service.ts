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
import type { BundlePricingRule } from './bundle-pricing-split';
import type { MetaobjectService } from '~/services/shopify/metaobject.service';

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
  /** SKU of the parent bundle variant (used by the non-Plus pricing fallback to
   *  target the merged line in the discount Function). */
  bundleSku?: string;
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
 * The real SKU of the parent bundle variant `ensureParentBundleProduct` creates
 * (`sku: handle`, `handle = superapp-bundle-<bundleId>`). This is the merged cart
 * line's merchandise SKU, so the non-Plus pricing fallback's discount rule
 * (`{ when: { skuIn: [bundleSku] } }`) MUST target THIS value — never the
 * recipe-declared `bundleSku`, which never reaches the storefront line. Single
 * source of truth so the rule target can never drift from the created SKU.
 * INVARIANT: `ResolvedBundle.bundleSku === ensureParentBundleProduct's variant sku`.
 */
export function bundleParentSku(bundleId: string): string {
  return `superapp-bundle-${bundleId}`;
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
  mutation SuperAppBundleProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
    productSet(synchronous: true, input: $input, identifier: $identifier) {
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

// Idempotency lookup uses the `discountNodes` superset connection because it
// reflects the write immediately — a search-index-backed connection lags for
// several seconds after a create, so a back-to-back republish would miss the
// just-created node and hit a "Title must be unique" error. DiscountCode* nodes
// are filtered out by the __typename check.
const DISCOUNT_NODES_QUERY = `#graphql
  query SuperAppBundlePricingDiscountLookup {
    discountNodes(first: 50) {
      nodes {
        id
        discount { __typename ... on DiscountAutomaticApp { title } }
      }
    }
  }
`;

const SHOPIFY_FUNCTIONS_QUERY = `#graphql
  query SuperAppBundlePricingFunctionLookup {
    shopifyFunctions(first: 50) {
      nodes { id apiType title handle }
    }
  }
`;

/**
 * Stable handle of the superapp-discount extension (extensions/superapp-discount/
 * shopify.extension.toml). On API 2026-04 the unified Discounts API reports this
 * function's `apiType` as `discount` (NOT the legacy `product_discounts`), and the
 * shop also carries a second `discount`-type function (superapp-shipping-discount),
 * so we key off the extension handle to bind the discount node to the right wasm.
 */
const DISCOUNT_FUNCTION_HANDLE = 'discount-function';

const DISCOUNT_AUTOMATIC_APP_CREATE = `#graphql
  mutation SuperAppBundlePricingDiscountCreate($discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $discount) {
      automaticAppDiscount { discountId }
      userErrors { message }
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
    const json = await this.graphqlJson<{
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
    }>(VARIANTS_BY_SKU, { query });
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
    const handle = bundleParentSku(args.bundleId);
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
    // identifier: {handle} is required for productSet to actually look up and update
    // the existing product by handle — without it, handle in `input` only sets the
    // field on a would-be new product, so every publish after the first collides on
    // "Handle has already been taken" instead of updating the existing bundle product.
    const json = await this.graphqlJson<{
      productSet?: {
        product?: { variants?: { nodes?: Array<{ id: string }> } };
        userErrors?: Array<{ message: string }>;
      };
    }>(PRODUCT_SET, { input, identifier: { handle } });
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

    // A top-level error here must NOT be treated as "no existing transform" — an app
    // has a single cart transform, so silently falling through to create would leave
    // two active transforms serving conflicting/duplicate bundle config at checkout.
    const existingJson = await this.graphqlJson<{ cartTransforms?: { nodes?: Array<{ id: string }> } }>(
      CART_TRANSFORMS_QUERY,
    );
    const existing = existingJson?.data?.cartTransforms?.nodes?.[0];

    if (existing?.id) {
      await this.setAppJsonMetafield(existing.id, 'bundle_config', value);
      return existing.id;
    }

    const createJson = await this.graphqlJson<{
      cartTransformCreate?: {
        cartTransform?: { id?: string };
        userErrors?: Array<{ message: string }>;
      };
    }>(CART_TRANSFORM_CREATE, {
      functionHandle: 'cart-transform-function',
      metafields: [{ namespace: '$app', key: 'bundle_config', type: 'json', value }],
    });
    const err = createJson?.data?.cartTransformCreate?.userErrors?.[0];
    if (err) throw new Error(`cartTransformCreate failed: ${err.message}`);
    const id = createJson?.data?.cartTransformCreate?.cartTransform?.id;
    if (!id) throw new Error('cartTransformCreate returned no id');
    return id;
  }

  /**
   * Merge managed bundle-pricing rules into the `discountRules` function config
   * (the same `$app:superapp_function_config` metaobject the discount wasm reads).
   * Managed rules are keyed `id: "bundle:*"` — previous managed rules are replaced,
   * module-authored rules are preserved verbatim. Idempotent on republish; a no-op
   * when there is nothing new to write and no stale managed rules to clear.
   */
  async writeBundlePricingRules(mo: MetaobjectService, rules: BundlePricingRule[]): Promise<void> {
    const existing = await mo.getFunctionConfigByKey('discountRules');
    const config = existing?.config ?? {};
    const prevRules = Array.isArray(config.rules)
      ? (config.rules as Array<Record<string, unknown>>)
      : [];
    const unmanaged = prevRules.filter(
      (r) => typeof r.id !== 'string' || !(r.id as string).startsWith('bundle:'),
    );
    const hadManaged = unmanaged.length !== prevRules.length;
    if (rules.length === 0 && !hadManaged) return;
    await mo.upsertFunctionConfigObject('discountRules', {
      ...config,
      rules: [...unmanaged, ...rules],
    });
  }

  /**
   * Idempotently ensure the automatic app discount node that activates the
   * superapp-discount function for bundle pricing. Title-keyed lookup first;
   * creates via discountAutomaticAppCreate when absent. Requires write_discounts
   * (already in shopify.app.toml scopes). Returns the discount node GID.
   */
  async ensureAutomaticBundleDiscount(): Promise<string> {
    const TITLE = 'SuperApp Bundle Pricing';
    const lookup = await this.graphqlJson<{
      discountNodes: {
        nodes: Array<{ id: string; discount: { __typename: string; title?: string } }>;
      };
    }>(DISCOUNT_NODES_QUERY);
    const existing = (lookup.data?.discountNodes?.nodes ?? []).find(
      (n) => n.discount.__typename === 'DiscountAutomaticApp' && n.discount.title === TITLE,
    );
    if (existing) return existing.id;

    const fns = await this.graphqlJson<{
      shopifyFunctions: { nodes: Array<{ id: string; apiType: string; title: string; handle: string }> };
    }>(SHOPIFY_FUNCTIONS_QUERY);
    const fn = (fns.data?.shopifyFunctions?.nodes ?? []).find((n) => n.handle === DISCOUNT_FUNCTION_HANDLE);
    if (!fn) throw new Error(`superapp-discount function not deployed (no function with handle "${DISCOUNT_FUNCTION_HANDLE}" found)`);

    const created = await this.graphqlJson<{
      discountAutomaticAppCreate: {
        automaticAppDiscount?: { discountId: string };
        userErrors: Array<{ message: string }>;
      };
    }>(DISCOUNT_AUTOMATIC_APP_CREATE, {
      discount: {
        title: TITLE,
        functionId: fn.id,
        // API 2026-04 unified Discounts: functions on the `discounts` apiType MUST
        // declare their discountClasses. superapp-discount targets
        // cart.lines.discounts.generate.run → PRODUCT (per-line) discounts.
        discountClasses: ['PRODUCT'],
        startsAt: new Date().toISOString(),
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
      },
    });
    const result = created.data?.discountAutomaticAppCreate;
    const err = result?.userErrors?.[0];
    if (err) throw new Error(`discountAutomaticAppCreate failed: ${err.message}`);
    const id = result?.automaticAppDiscount?.discountId;
    if (!id) throw new Error('discountAutomaticAppCreate returned no id');
    return id;
  }

  /** Write an app-owned ($app namespace) json metafield on an owner resource. */
  async setAppJsonMetafield(ownerId: string, key: string, value: string): Promise<void> {
    const json = await this.graphqlJson<{ metafieldsSet?: { userErrors?: Array<{ message: string }> } }>(
      METAFIELDS_SET,
      { metafields: [{ ownerId, namespace: '$app', key, type: 'json', value }] },
    );
    const err = json?.data?.metafieldsSet?.userErrors?.[0];
    if (err) throw new Error(`metafieldsSet failed: ${err.message}`);
  }

  /**
   * A top-level GraphQL error (as opposed to a mutation's userErrors) leaves `data`
   * undefined. Every call site in this file must throw on that rather than reading
   * an absent data node as "empty"/"none exist yet" — see activateCartTransform's
   * existence check and setAppJsonMetafield for the concrete failure modes this
   * guards against.
   */
  private async graphqlJson<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data?: T; errors?: Array<{ message?: string }> }> {
    const res = await this.admin.graphql(query, variables ? { variables } : undefined);
    const json = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
    if (json?.errors?.length) {
      throw new Error(json.errors.map((e) => e?.message ?? 'Unknown GraphQL error').join('; '));
    }
    return json;
  }
}

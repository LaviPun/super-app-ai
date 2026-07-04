/**
 * Fetches published SuperApp checkout offers from `$app:superapp_checkout_upsell`
 * metaobjects via `superapp.checkout/upsell_refs` (list.metaobject_reference),
 * then resolves referenced product variants (title / image / price) so the UI
 * only ever shows buyer-facing content — never GIDs, targets, or raw config JSON.
 * Uses shopify.query() (Storefront API) — Preact / 64 KB friendly.
 *
 * Three module types publish into the same list; each is meant for one surface:
 * - `checkout.upsell`    { offerTitle, productVariantGid, discountPercent } → checkout
 * - `checkout.block`     { target, title, message?, productVariantGid? }    → from config.target
 * - `postPurchase.offer` { offerTitle, productVariantGid?, message? }       → thank-you
 */
import { useState, useEffect } from 'preact/hooks';
import { parseCheckoutFields, parseCheckoutLayout } from '../lib/checkout-content';
import type { CheckoutField, CheckoutLayoutItem } from '../lib/checkout-content';

export type OfferProduct = {
  variantGid: string;
  title: string;
  imageUrl?: string;
  imageAlt?: string;
  /** Price localized for the buyer, e.g. "$29.99". Omitted when unparseable. */
  price?: string;
  availableForSale: boolean;
};

export type CheckoutOffer = {
  /** Stable render key (the metaobject GID — never displayed). */
  key: string;
  heading?: string;
  message?: string;
  product?: OfferProduct;
  /** Interactive buyer-input fields (build #2). Empty on legacy offers. */
  fields: CheckoutField[];
  /** Non-interactive layout/presentation blocks (build #2). Empty on legacy offers. */
  layout: CheckoutLayoutItem[];
};

export type UseCheckoutConfigResult =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error' }
  | { status: 'ready'; offers: CheckoutOffer[] };

const UPSELL_REFS_QUERY = `#graphql
  query SuperAppCheckoutUpsellRefs {
    shop {
      upsellRefs: metafield(namespace: "superapp.checkout", key: "upsell_refs") {
        references(first: 128) {
          nodes {
            ... on Metaobject {
              id
              moduleType: field(key: "module_type") { value }
              configJson: field(key: "config_json") { value }
            }
          }
        }
      }
    }
  }
`;

const VARIANTS_QUERY = `#graphql
  query SuperAppUpsellVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        availableForSale
        price { amount currencyCode }
        image { url altText }
        product { title featuredImage { url altText } }
      }
    }
  }
`;

type MetaobjectNode = {
  id?: string;
  moduleType?: { value?: string } | null;
  configJson?: { value?: string } | null;
};
type RefsData = { shop: { upsellRefs?: { references?: { nodes?: MetaobjectNode[] } } | null } };

type ImageNode = { url?: string; altText?: string | null } | null;
type VariantNode = {
  id?: string;
  title?: string;
  availableForSale?: boolean;
  price?: { amount?: string; currencyCode?: string } | null;
  image?: ImageNode;
  product?: { title?: string; featuredImage?: ImageNode } | null;
} | null;
type VariantsData = { nodes?: VariantNode[] };

type Surface = 'checkout' | 'thank-you';

const VARIANT_GID_RE = /^gid:\/\/shopify\/ProductVariant\/\d+$/;

function surfaceForExtensionTarget(extensionTarget: string): Surface {
  return extensionTarget.startsWith('purchase.thank-you.') ? 'thank-you' : 'checkout';
}

/**
 * The surface a published config is meant for. Configs whose intent can't be
 * determined (unknown placement / unknown module type) render nowhere.
 */
function intendedSurface(moduleType: string | undefined, config: Record<string, unknown>): Surface | null {
  const target = typeof config.target === 'string' ? config.target : undefined;
  if (target) {
    if (target.startsWith('purchase.thank-you.')) return 'thank-you';
    if (target.startsWith('purchase.checkout.')) return 'checkout';
    return null;
  }
  if (moduleType === 'checkout.upsell') return 'checkout';
  if (moduleType === 'postPurchase.offer') return 'thank-you';
  return null;
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

type RecommendationConfig = {
  strategy?: string;
  manualVariantGids?: unknown;
  fallback?: string;
};

/**
 * R2.3 — resolve `config.recommendation` to a single variant GID for checkout.
 *
 * Checkout has NO App Proxy access and must stay ≤64KB / Storefront-API only, so
 * only the `manual` strategy (explicit variant GIDs — semantically the legacy
 * `productVariantGid`) is resolved here via the existing VARIANTS_QUERY path. The
 * other static strategies (related/complementary/collection/cart-derived) would
 * need extra Storefront queries; they and the dynamic strategies degrade to the
 * `fallback` — and if `fallback` is `manual` with variants we resolve that, else
 * the offer renders heading/message only (existing empty-safe behavior). This is
 * an honest partial: `manual` resolves for real; the rest degrade, never fabricate.
 */
function variantGidFromRecommendation(rec: RecommendationConfig): string | undefined {
  const manual = Array.isArray(rec.manualVariantGids)
    ? (rec.manualVariantGids as unknown[]).find(
        (g): g is string => typeof g === 'string' && VARIANT_GID_RE.test(g),
      )
    : undefined;
  if (rec.strategy === 'manual') return manual;
  // Non-manual strategy → degrade to fallback. Only fallback=manual is resolvable
  // in checkout (via the manual variants); other fallbacks render heading/message.
  if (rec.fallback === 'manual') return manual;
  return undefined;
}

type Draft = {
  key: string;
  heading?: string;
  message?: string;
  variantGid?: string;
  fields: CheckoutField[];
  layout: CheckoutLayoutItem[];
};

function draftFromNode(node: MetaobjectNode, surface: Surface): Draft | null {
  const raw = node?.configJson?.value;
  if (!raw || !node?.id) return null;

  let config: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    config = parsed as Record<string, unknown>;
  } catch {
    return null; // malformed JSON → render nothing for this entry
  }

  if (intendedSurface(node.moduleType?.value ?? undefined, config) !== surface) return null;

  const heading = asTrimmedString(config.offerTitle) ?? asTrimmedString(config.title);
  const message = asTrimmedString(config.message);
  const rawGid = asTrimmedString(config.productVariantGid);
  const legacyGid = rawGid && VARIANT_GID_RE.test(rawGid) ? rawGid : undefined;
  // Legacy `productVariantGid` wins (byte-identical for existing recipes); only fall
  // to the recommendation source when there is no legacy variant present.
  const rec =
    config.recommendation && typeof config.recommendation === 'object' && !Array.isArray(config.recommendation)
      ? (config.recommendation as RecommendationConfig)
      : undefined;
  const variantGid = legacyGid ?? (rec ? variantGidFromRecommendation(rec) : undefined);

  // Build #2 render vocab. Fields are interactive only on the checkout surface;
  // on thank-you they degrade to read-only labels (the renderer decides). Layout
  // is presentational on both surfaces.
  const fields = parseCheckoutFields(config.fields, surface === 'checkout');
  const layout = parseCheckoutLayout(config.layout);

  if (!heading && !message && !variantGid && fields.length === 0 && layout.length === 0) {
    return null; // nothing buyer-facing
  }

  return { key: node.id, heading, message, variantGid, fields, layout };
}

function productFromVariantNode(node: VariantNode): OfferProduct | null {
  if (!node?.id) return null;
  const productTitle = asTrimmedString(node.product?.title);
  const variantTitle = asTrimmedString(node.title);
  const title =
    productTitle && variantTitle && variantTitle !== 'Default Title'
      ? `${productTitle} — ${variantTitle}`
      : productTitle ?? variantTitle;
  if (!title) return null;

  const image = node.image ?? node.product?.featuredImage ?? null;
  const amount = Number(node.price?.amount);
  const currencyCode = node.price?.currencyCode;
  const price =
    Number.isFinite(amount) && currencyCode
      ? shopify.i18n.formatCurrency(amount, { currency: currencyCode })
      : undefined;

  return {
    variantGid: node.id,
    title,
    imageUrl: asTrimmedString(image?.url),
    imageAlt: asTrimmedString(image?.altText ?? undefined),
    price,
    availableForSale: node.availableForSale === true,
  };
}

export function useCheckoutConfig(extensionTarget: string): UseCheckoutConfigResult {
  const [result, setResult] = useState<UseCheckoutConfigResult>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (typeof shopify === 'undefined' || !shopify.query) {
      setResult({ status: 'hidden' });
      return;
    }
    const surface = surfaceForExtensionTarget(extensionTarget);

    async function load(): Promise<void> {
      const { data } = await shopify.query<RefsData>(UPSELL_REFS_QUERY);
      const nodes = data?.shop?.upsellRefs?.references?.nodes ?? [];

      const drafts: Draft[] = [];
      for (const node of nodes) {
        const draft = draftFromNode(node, surface);
        if (draft) drafts.push(draft);
      }

      const gids = [...new Set(drafts.map((d) => d.variantGid).filter((gid): gid is string => Boolean(gid)))];
      const productsByGid = new Map<string, OfferProduct>();
      if (gids.length > 0) {
        try {
          const { data: variantData } = await shopify.query<VariantsData>(VARIANTS_QUERY, {
            variables: { ids: gids },
          });
          for (const node of variantData?.nodes ?? []) {
            const product = productFromVariantNode(node);
            if (product) productsByGid.set(product.variantGid, product);
          }
        } catch {
          // Variant lookup failed — offers still render their heading/message below.
        }
      }

      const offers: CheckoutOffer[] = [];
      for (const draft of drafts) {
        const product = draft.variantGid ? productsByGid.get(draft.variantGid) : undefined;
        const hasContent =
          !!draft.heading || !!draft.message || !!product || draft.fields.length > 0 || draft.layout.length > 0;
        if (!hasContent) continue; // nothing left to show
        offers.push({
          key: draft.key,
          heading: draft.heading,
          message: draft.message,
          product,
          fields: draft.fields,
          layout: draft.layout,
        });
      }

      if (cancelled) return;
      setResult(offers.length > 0 ? { status: 'ready', offers } : { status: 'hidden' });
    }

    load().catch(() => {
      if (!cancelled) setResult({ status: 'error' });
    });

    return () => {
      cancelled = true;
    };
  }, [extensionTarget]);

  return result;
}

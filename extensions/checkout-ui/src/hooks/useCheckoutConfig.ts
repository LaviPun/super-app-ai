/**
 * Fetches SuperApp checkout upsell config from $app:superapp_checkout_upsell metaobjects
 * via superapp.checkout/upsell_refs (list.metaobject_reference).
 * Uses shopify.query() (Storefront API) — Preact / 64 KB friendly.
 */
import { useState, useEffect } from 'preact/hooks';

export type CheckoutBlockConfig = {
  target: string;
  offerTitle?: string;
  productVariantGid?: string;
  discountPercent?: number;
  [key: string]: unknown;
};

export type UseCheckoutConfigResult =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error' }
  | { status: 'ready'; configs: CheckoutBlockConfig[] };

const UPSELL_REFS_QUERY = `#graphql
  query SuperAppCheckoutUpsellRefs {
    shop {
      upsellRefs: metafield(namespace: "superapp.checkout", key: "upsell_refs") {
        references(first: 128) {
          nodes {
            ... on Metaobject {
              moduleId: field(key: "module_id") { value }
              configJson: field(key: "config_json") { value }
            }
          }
        }
      }
    }
  }
`;

type MetaobjectNode = { moduleId?: { value?: string }; configJson?: { value?: string } };
type QueryData = { shop: { upsellRefs?: { references?: { nodes?: MetaobjectNode[] } } | null } };

export function useCheckoutConfig(target: string): UseCheckoutConfigResult {
  const [result, setResult] = useState<UseCheckoutConfigResult>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (typeof shopify === 'undefined' || !shopify.query) {
      setResult({ status: 'hidden' });
      return;
    }
    shopify
      .query<QueryData>(UPSELL_REFS_QUERY)
      .then(({ data }: { data?: QueryData }) => {
        if (cancelled) return;
        const nodes = data?.shop?.upsellRefs?.references?.nodes ?? [];
        const parsed: Array<{ sortKey: string; config: CheckoutBlockConfig }> = [];
        for (const node of nodes) {
          const raw = node?.configJson?.value;
          if (!raw) continue;
          try {
            const config = JSON.parse(raw) as CheckoutBlockConfig;
            const mid = (node.moduleId?.value ?? '').trim();
            parsed.push({ sortKey: mid || raw.slice(0, 32), config: { ...config, target } });
          } catch {
            /* malformed JSON, skip */
          }
        }
        parsed.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        const configs = parsed.map((p) => p.config);
        if (configs.length === 0) {
          setResult({ status: 'hidden' });
          return;
        }
        setResult({ status: 'ready', configs });
      })
      .catch(() => {
        if (!cancelled) setResult({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  return result;
}

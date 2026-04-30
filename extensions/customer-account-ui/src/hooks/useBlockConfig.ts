/**
 * Fetches SuperApp customer account block config from
 * superapp.customer_account/block_refs (list.metaobject_reference).
 * Uses shopify.query() in the UI extension runtime.
 */
import { useState, useEffect } from 'preact/hooks';

export type BlockKind = 'TEXT' | 'LINK' | 'BADGE' | 'DIVIDER';
export type BlockDef = {
  kind: BlockKind;
  content?: string;
  url?: string;
  tone?: 'info' | 'success' | 'warning' | 'critical';
};

export type BlockConfig = {
  target: string;
  title: string;
  blocks: BlockDef[];
  b2bOnly: boolean;
};

export type UseBlockConfigResult =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: BlockConfig };

const CONFIG_QUERY = `#graphql
  query SuperAppCustomerAccountConfigRefs {
    shop {
      blockRefs: metafield(namespace: "superapp.customer_account", key: "block_refs") {
        references(first: 128) {
          nodes {
            ... on Metaobject {
              target: field(key: "target") { value }
              configJson: field(key: "config_json") { value }
            }
          }
        }
      }
    }
  }
`;

type MetaobjectNode = {
  target?: { value?: string };
  configJson?: { value?: string };
};
type QueryData = {
  shop?: {
    blockRefs?: {
      references?: { nodes?: MetaobjectNode[] };
    } | null;
  };
};

export function useBlockConfig(target: string): UseBlockConfigResult {
  const [result, setResult] = useState<UseBlockConfigResult>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (typeof shopify === 'undefined' || !shopify.query) {
      setResult({ status: 'hidden' });
      return;
    }
    shopify
      .query<QueryData>(CONFIG_QUERY)
      .then(({ data }: { data?: QueryData }) => {
        if (cancelled) return;
        const nodes = data?.shop?.blockRefs?.references?.nodes ?? [];
        for (const node of nodes) {
          const targetValue = node?.target?.value;
          const rawConfig = node?.configJson?.value;
          if (!rawConfig) continue;
          if (targetValue && targetValue !== target) continue;
          try {
            const config = JSON.parse(rawConfig) as BlockConfig;
            setResult({ status: 'ready', config });
            return;
          } catch {
            // Ignore malformed rows and continue scanning.
          }
        }
        setResult({ status: 'hidden' });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ status: 'error', message: String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  return result;
}

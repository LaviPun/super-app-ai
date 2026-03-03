/**
 * Fetches the SuperApp block config via Storefront API (shop metafield).
 * Uses global shopify.query() — 2026-01 Preact stack.
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
  query SuperAppCustomerAccountConfig {
    shop {
      metafield(namespace: "superapp.customer_account", key: "blocks") {
        value
      }
    }
  }
`;

export function useBlockConfig(target: string): UseBlockConfigResult {
  const [result, setResult] = useState<UseBlockConfigResult>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (typeof shopify === 'undefined' || !shopify.query) {
      setResult({ status: 'hidden' });
      return;
    }
    shopify
      .query(CONFIG_QUERY)
      .then(({ data }: { data?: { shop: { metafield: { value: string } | null } } }) => {
        if (cancelled) return;
        const raw = data?.shop?.metafield?.value;
        if (!raw) {
          setResult({ status: 'hidden' });
          return;
        }
        const config: BlockConfig = JSON.parse(raw);
        if (config.target !== target) {
          setResult({ status: 'hidden' });
          return;
        }
        setResult({ status: 'ready', config });
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

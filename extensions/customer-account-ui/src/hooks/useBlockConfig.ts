/**
 * Fetches SuperApp customer-account block config from
 * `superapp.customer_account/block_refs` (list.metaobject_reference) via
 * `shopify.query()`, then (build #3, 034) resolves any live-data bindings the
 * matched block declares through the Customer Account / Order API and our
 * app-owned source. Content parsing is defensive; binding resolution degrades
 * gracefully to literal content. Preact / 64 KB friendly.
 *
 * Back-compat: a legacy `{ target, title, blocks:[{kind:'TEXT',content}], b2bOnly }`
 * config resolves to the same ready state it always did — the new fields are all
 * optional and bindings only run when a block declares one.
 */
import { useState, useEffect } from 'preact/hooks';
import { parseCaBlocks } from '../lib/ca-content';
import type { CaBlock, CaBinding } from '../lib/ca-content';
import { resolveBindings } from '../lib/ca-bindings';

// Re-exported so existing block entry files keep their imports working.
export type BlockKind = CaBlock['kind'];
export type BlockDef = CaBlock;

export type BlockConfig = {
  target: string;
  title: string;
  blocks: CaBlock[];
  b2bOnly: boolean;
  /** Resolved live-binding values keyed by binding id (build #3). */
  bound?: Partial<Record<CaBinding, string>>;
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

/** Collect every binding declared across a block list. */
function declaredBindings(blocks: CaBlock[]): Set<CaBinding> {
  const set = new Set<CaBinding>();
  for (const b of blocks) if (b.bind) set.add(b.bind);
  return set;
}

export function useBlockConfig(target: string): UseBlockConfigResult {
  const [result, setResult] = useState<UseBlockConfigResult>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (typeof shopify === 'undefined' || !shopify.query) {
      setResult({ status: 'hidden' });
      return;
    }

    async function load(): Promise<void> {
      const { data } = await shopify.query<QueryData>(CONFIG_QUERY);
      const nodes = data?.shop?.blockRefs?.references?.nodes ?? [];

      for (const node of nodes) {
        const targetValue = node?.target?.value;
        const rawConfig = node?.configJson?.value;
        if (!rawConfig) continue;
        if (targetValue && targetValue !== target) continue;

        let parsed: { title?: unknown; blocks?: unknown; b2bOnly?: unknown };
        try {
          parsed = JSON.parse(rawConfig);
        } catch {
          continue; // malformed row → keep scanning
        }

        // Enforce the merchant's "B2B customers only" setting.
        if (parsed.b2bOnly === true) {
          const isB2B = Boolean(
            (shopify as unknown as {
              authenticatedAccount?: { purchasingCompany?: { value?: unknown } };
            }).authenticatedAccount?.purchasingCompany?.value,
          );
          if (!isB2B) continue;
        }

        const blocks = parseCaBlocks(parsed.blocks);
        const config: BlockConfig = {
          target: typeof targetValue === 'string' ? targetValue : target,
          title: typeof parsed.title === 'string' ? parsed.title : '',
          blocks,
          b2bOnly: parsed.b2bOnly === true,
        };

        // Resolve live bindings (best-effort). Failure never blocks render — the
        // renderer falls back to each block's literal content.
        const bindings = declaredBindings(blocks);
        if (bindings.size > 0) {
          try {
            config.bound = await resolveBindings(bindings);
          } catch {
            config.bound = {};
          }
        }

        if (!cancelled) setResult({ status: 'ready', config });
        return;
      }

      if (!cancelled) setResult({ status: 'hidden' });
    }

    load().catch((err) => {
      if (!cancelled) setResult({ status: 'error', message: String(err) });
    });

    return () => {
      cancelled = true;
    };
  }, [target]);

  return result;
}

/**
 * Fetches published admin.block modules from the shop via metaobject references.
 * Reads superapp.admin/block_refs (list.metaobject_reference) — API 2026-04+ compliant.
 * Each block is a $app:superapp_admin_block metaobject entry; no large JSON blobs.
 */
import { useState, useEffect } from 'preact/hooks';

export type AdminBlockConfig = {
  type: string;
  name: string;
  target: string;
  label: string;
  config: Record<string, unknown>;
};

export type AdminBlocksState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error' }
  | { status: 'ready'; blocks: AdminBlockConfig[] };

const METAFIELD_QUERY = `{
  shop {
    blockRefs: metafield(namespace: "superapp.admin", key: "block_refs") {
      references(first: 128) {
        nodes {
          ... on Metaobject {
            moduleType: field(key: "module_type") { value }
            name:       field(key: "name")        { value }
            target:     field(key: "target")      { value }
            label:      field(key: "label")       { value }
            configJson: field(key: "config_json") { value }
          }
        }
      }
    }
  }
}`;

type MetaobjectNode = {
  moduleType?: { value: string } | null;
  name?: { value: string } | null;
  target?: { value: string } | null;
  label?: { value: string } | null;
  configJson?: { value: string } | null;
};

type QueryData = {
  shop?: {
    blockRefs?: { references?: { nodes: MetaobjectNode[] } } | null;
  };
};

export function useAdminBlocks(target: string): AdminBlocksState {
  const [state, setState] = useState<AdminBlocksState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: METAFIELD_QUERY }),
    })
      .then((res) => res.json())
      .then(({ data }: { data?: QueryData }) => {
        if (cancelled) return;
        const nodes = data?.shop?.blockRefs?.references?.nodes ?? [];
        const blocks: AdminBlockConfig[] = nodes
          .filter((n) => n.target?.value === target)
          .map((n) => ({
            type: n.moduleType?.value ?? '',
            name: n.name?.value ?? '',
            target: n.target?.value ?? '',
            label: n.label?.value ?? '',
            config: (() => {
              try { return JSON.parse(n.configJson?.value ?? '{}') as Record<string, unknown>; }
              catch { return {}; }
            })(),
          }));
        setState(blocks.length > 0 ? { status: 'ready', blocks } : { status: 'hidden' });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => { cancelled = true; };
  }, [target]);

  return state;
}

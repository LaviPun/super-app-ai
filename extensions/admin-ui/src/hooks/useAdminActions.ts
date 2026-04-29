/**
 * Fetches a published admin.action module from the shop via metaobject references.
 * Reads superapp.admin/action_refs (list.metaobject_reference) — API 2026-04+ compliant.
 * Each action is a $app:superapp_admin_action metaobject entry; no large JSON blobs.
 */
import { useState, useEffect } from 'preact/hooks';

export type AdminActionConfig = {
  type: string;
  name: string;
  target: string;
  label: string;
  title: string;
  config: Record<string, unknown>;
};

export type AdminActionsState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error' }
  | { status: 'ready'; action: AdminActionConfig };

const METAFIELD_QUERY = `{
  shop {
    actionRefs: metafield(namespace: "superapp.admin", key: "action_refs") {
      references(first: 128) {
        nodes {
          ... on Metaobject {
            moduleType: field(key: "module_type") { value }
            name:       field(key: "name")        { value }
            target:     field(key: "target")      { value }
            label:      field(key: "label")       { value }
            title:      field(key: "title")       { value }
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
  title?: { value: string } | null;
  configJson?: { value: string } | null;
};

type QueryData = {
  shop?: {
    actionRefs?: { references?: { nodes: MetaobjectNode[] } } | null;
  };
};

export function useAdminActions(target: string): AdminActionsState {
  const [state, setState] = useState<AdminActionsState>({ status: 'loading' });

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
        const nodes = data?.shop?.actionRefs?.references?.nodes ?? [];
        const match = nodes.find((n) => n.target?.value === target);
        if (!match) { setState({ status: 'hidden' }); return; }
        setState({
          status: 'ready',
          action: {
            type: match.moduleType?.value ?? '',
            name: match.name?.value ?? '',
            target: match.target?.value ?? '',
            label: match.label?.value ?? '',
            title: match.title?.value ?? '',
            config: (() => {
              try { return JSON.parse(match.configJson?.value ?? '{}') as Record<string, unknown>; }
              catch { return {}; }
            })(),
          },
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => { cancelled = true; };
  }, [target]);

  return state;
}

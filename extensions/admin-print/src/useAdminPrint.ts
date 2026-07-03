/**
 * Fetches published admin.print modules from the shop via metaobject references.
 * Reads superapp.admin/print_refs (list.metaobject_reference, API 2026-04+). Each entry
 * is a $app:superapp_admin_print metaobject written by the publish pipeline; the
 * extension picks the one whose `target` matches the current print-action target and
 * uses its config (documentKind/title) to build the print `src` URL.
 */
import { useState, useEffect } from 'preact/hooks';

export type AdminPrintConfig = {
  moduleId: string;
  name: string;
  target: string;
  label: string;
  config: Record<string, unknown>;
};

export type AdminPrintState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error' }
  | { status: 'ready'; docs: AdminPrintConfig[] };

const METAFIELD_QUERY = `{
  shop {
    printRefs: metafield(namespace: "superapp.admin", key: "print_refs") {
      references(first: 64) {
        nodes {
          ... on Metaobject {
            moduleId:   field(key: "module_id")   { value }
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
  moduleId?: { value: string } | null;
  name?: { value: string } | null;
  target?: { value: string } | null;
  label?: { value: string } | null;
  configJson?: { value: string } | null;
};

type QueryData = {
  shop?: { printRefs?: { references?: { nodes: MetaobjectNode[] } } | null };
};

export function useAdminPrint(target: string): AdminPrintState {
  const [state, setState] = useState<AdminPrintState>({ status: 'loading' });

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
        const nodes = data?.shop?.printRefs?.references?.nodes ?? [];
        const docs: AdminPrintConfig[] = nodes
          .filter((n) => n.target?.value === target)
          .map((n) => ({
            moduleId: n.moduleId?.value ?? '',
            name: n.name?.value ?? '',
            target: n.target?.value ?? '',
            label: n.label?.value ?? '',
            config: (() => {
              try { return JSON.parse(n.configJson?.value ?? '{}') as Record<string, unknown>; }
              catch { return {}; }
            })(),
          }));
        setState(docs.length > 0 ? { status: 'ready', docs } : { status: 'hidden' });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => { cancelled = true; };
  }, [target]);

  return state;
}

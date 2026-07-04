/**
 * Fetches the published admin.discountUi module config from the shop via metaobject
 * references. Reads superapp.admin/discount_ui_refs (list.metaobject_reference,
 * API 2026-04+). Each entry is a $app:superapp_admin_discount_ui metaobject written by
 * the publish pipeline. The extension renders the declared `fields[]` as the settings
 * form; when no module is published it falls back to a minimal default so the discount
 * still has a usable settings surface.
 */
import { useState, useEffect } from 'preact/hooks';

export type DiscountUiFieldKind = 'text' | 'number' | 'toggle' | 'select';

export type DiscountUiField = {
  key: string;
  label: string;
  kind: DiscountUiFieldKind;
};

export type DiscountUiConfig = {
  title: string;
  discountClass: string;
  description?: string;
  functionHandle?: string;
  fields: DiscountUiField[];
};

export type DiscountUiState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; config: DiscountUiConfig };

const METAFIELD_QUERY = `{
  shop {
    discountUiRefs: metafield(namespace: "superapp.admin", key: "discount_ui_refs") {
      references(first: 64) {
        nodes {
          ... on Metaobject {
            name:       field(key: "name")        { value }
            configJson: field(key: "config_json") { value }
          }
        }
      }
    }
  }
}`;

type MetaobjectNode = {
  name?: { value: string } | null;
  configJson?: { value: string } | null;
};

type QueryData = {
  shop?: {
    discountUiRefs?: { references?: { nodes: MetaobjectNode[] } } | null;
  };
};

const DEFAULT_CONFIG: DiscountUiConfig = {
  title: 'Discount settings',
  discountClass: 'product',
  fields: [{ key: 'percentage', label: 'Percentage off', kind: 'number' }],
};

function parseConfig(raw: string | null | undefined): DiscountUiConfig | null {
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw) as Partial<DiscountUiConfig>;
    return {
      title: String(cfg.title ?? 'Discount settings'),
      discountClass: String(cfg.discountClass ?? 'product'),
      description: cfg.description,
      functionHandle: cfg.functionHandle,
      fields: Array.isArray(cfg.fields)
        ? cfg.fields
            .filter((f): f is DiscountUiField => !!f && typeof f.key === 'string')
            .map((f) => ({ key: f.key, label: String(f.label ?? f.key), kind: (f.kind ?? 'text') as DiscountUiFieldKind }))
        : [],
    };
  } catch {
    return null;
  }
}

export function useDiscountUiConfig(): DiscountUiState {
  const [state, setState] = useState<DiscountUiState>({ status: 'loading' });

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
        const nodes = data?.shop?.discountUiRefs?.references?.nodes ?? [];
        const first = nodes.map((n) => parseConfig(n.configJson?.value)).find((c) => c != null);
        setState({ status: 'ready', config: first ?? DEFAULT_CONFIG });
      })
      .catch(() => {
        // Degrade to defaults rather than a hard error so the discount is still configurable.
        if (!cancelled) setState({ status: 'ready', config: DEFAULT_CONFIG });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

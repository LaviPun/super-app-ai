/**
 * Generic print-action renderer for every admin.print target. Reads the published
 * admin.print config for the current target, lets the merchant pick which configured
 * document(s) to print, and points `s-admin-print-action` `src` at the app's
 * /admin-print/document route parameterized by the chosen documentKind + the selected
 * resource id(s). No per-module code — one renderer for every print target.
 */
import { useMemo, useState } from 'preact/hooks';
import { useAdminPrint, type AdminPrintConfig } from './useAdminPrint';

/** Collect the selected resource id(s) from the Print Action API data. */
function selectedIds(): string[] {
  const selected = shopify?.data?.selected ?? [];
  return selected.map((s) => s.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Build the app print-document URL for a configured print doc + the current selection. */
function printSrc(doc: AdminPrintConfig, ids: string[]): string {
  const documentKind = String(doc.config.documentKind ?? 'packing-slip');
  const params = new URLSearchParams({ moduleId: doc.moduleId, documentKind });
  if (ids.length > 0) params.set('ids', ids.join(','));
  return `/admin-print/document?${params.toString()}`;
}

export function PrintAction({ target }: { target: string }) {
  const state = useAdminPrint(target);
  const ids = useMemo(selectedIds, []);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <s-admin-print-action src={null}>
        <s-text color="subdued">Loading…</s-text>
      </s-admin-print-action>
    );
  }
  if (state.status === 'error') {
    return (
      <s-admin-print-action src={null}>
        <s-banner heading="SuperApp" tone="critical">
          <s-text>Failed to load print document configuration.</s-text>
        </s-banner>
      </s-admin-print-action>
    );
  }
  if (state.status === 'hidden') {
    return (
      <s-admin-print-action src={null}>
        <s-banner heading="SuperApp" tone="info">
          <s-text>
            No print document configured for this page. Publish an admin.print module
            targeting {target} from the SuperApp.
          </s-text>
        </s-banner>
      </s-admin-print-action>
    );
  }

  const active = state.docs.find((d) => d.moduleId === activeModuleId) ?? null;
  const src = active ? printSrc(active, ids) : null;

  return (
    <s-admin-print-action src={src}>
      <s-stack gap="base">
        <s-text type="strong">Documents</s-text>
        {state.docs.map((doc) => (
          <s-checkbox
            key={doc.moduleId}
            name={doc.moduleId}
            label={doc.label || String(doc.config.title ?? 'Document')}
            checked={activeModuleId === doc.moduleId}
            onChange={() => setActiveModuleId(activeModuleId === doc.moduleId ? null : doc.moduleId)}
          />
        ))}
        {!active ? <s-text color="subdued">Select a document to preview and print.</s-text> : null}
      </s-stack>
    </s-admin-print-action>
  );
}

import type { CSSProperties } from 'react';
import { EmptyState, KV, StatusBadge } from '~/components/merchant/polaris';
import { catTone } from '~/utils/type-label';

const MONO_PRE: CSSProperties = {
  margin: 0, maxHeight: 480, overflow: 'auto', padding: 16,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};

const RUNTIME_LABEL: Record<string, string> = {
  theme: 'Theme app extension',
  'checkout-ui': 'Checkout UI extension',
  'customer-account-ui': 'Customer account extension',
  'admin-ui': 'Admin UI extension',
  flow: 'Shopify Flow',
  'web-pixel': 'Web Pixel',
  'pos-ui': 'POS UI extension',
  'app-proxy': 'App proxy (always available)',
  function: 'Shopify Function',
  'agentic-feed': 'Agentic product feed',
  composite: 'Composite (uses other modules)',
};

/**
 * The module edit page's "Overview" tab. Job #1 for the merchant here is
 * "see what this looks like" — the live preview is the biggest, first thing
 * on the page. Everything else (type/category/version/deployment/placement/
 * captures) that used to live in four separate stacked cards is now one
 * "Module info" reference card, so the preview reads as the clear visual
 * anchor instead of competing with equally-weighted metadata boxes.
 */
export function OverviewTab({
  moduleName,
  version,
  previewHtml,
  previewJson,
  previewLoaded,
  onPreviewLoad,
  onOpenPreview,
  validationReport,
  onFillMissingSettings,
  fillingSettings,
  category,
  categoryLabel,
  status,
  deployment,
  placement,
  captureCount,
  moduleId,
}: {
  moduleName: string;
  version: number;
  previewHtml: string | null;
  previewJson: unknown | null;
  previewLoaded: boolean;
  onPreviewLoad: () => void;
  onOpenPreview: () => void;
  validationReport: { overall: string; checks: { id: string; severity: string; status: string; description: string }[] } | null;
  onFillMissingSettings: () => void;
  fillingSettings: boolean;
  category: string;
  categoryLabel: string;
  status: string;
  deployment: { runtime: string; note: string; requiresPlan: string | null; runtimeShipped: boolean | null } | null;
  placement: string;
  captureCount: number;
  moduleId: string;
}) {
  return (
    <s-grid gridTemplateColumns="@container (inline-size > 760px) 2fr 1fr, 1fr" gap="base">
      <s-stack gap="base">
        <s-section padding="none" heading="Live preview">
          <s-box border="base" borderRadius="base" overflow="hidden">
            {previewHtml ? (
              <div style={{ position: 'relative', background: '#fff' }}>
                <iframe
                  title={`Preview of ${moduleName}`}
                  srcDoc={previewHtml}
                  // No allow-same-origin: previewHtml may include AI-generated
                  // (draft.previewHtmlJson) markup. Keeping the frame at an opaque
                  // origin means any injected script can't reach the admin app's
                  // origin (cookies/storage/parent DOM). The self-contained preview
                  // scripts (countdown, link-intercept) run fine without it.
                  sandbox="allow-scripts"
                  onLoad={onPreviewLoad}
                  style={{ display: 'block', width: '100%', height: 560, border: 0, background: '#fff' }}
                />
                {!previewLoaded && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff' }}>
                    <s-spinner size="base" accessibilityLabel="Rendering preview" />
                    <s-text color="subdued">Rendering preview…</s-text>
                  </div>
                )}
              </div>
            ) : previewJson ? (
              <pre style={MONO_PRE}>{JSON.stringify(previewJson, null, 2)}</pre>
            ) : (
              <EmptyState icon="view" heading="No preview available">
                This module type has no visual storefront preview.
              </EmptyState>
            )}
          </s-box>
          <s-box padding="base">
            <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
              <s-text color="subdued">This is how {moduleName.toLowerCase()} appears on your storefront.</s-text>
              <s-button icon="external" onClick={onOpenPreview}>Open in new tab</s-button>
            </s-grid>
          </s-box>
        </s-section>

        {validationReport && (
          <s-section heading="Validation">
            <s-stack gap="small-200">
              {validationReport.checks.slice(0, 6).map((c) => (
                <s-stack key={c.id} direction="inline" gap="small-100" alignItems="center">
                  <s-icon
                    type={c.status === 'PASS' ? 'check-circle' : 'alert-triangle'}
                    tone={c.status === 'PASS' ? 'success' : 'critical'}
                    size="small"
                  />
                  <s-text>{c.description}</s-text>
                </s-stack>
              ))}
            </s-stack>
            <s-divider />
            <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
              <s-text color="subdued">Let AI fill any remaining empty settings — merchant-set values are never overwritten.</s-text>
              <s-button icon="wand" loading={fillingSettings || undefined} onClick={onFillMissingSettings}>
                Fill missing settings
              </s-button>
            </s-grid>
          </s-section>
        )}
      </s-stack>

      <s-stack gap="base">
        <s-section heading="Module info">
          <s-stack gap="base">
            <KV rows={[
              ['Type', <s-badge key="t" tone={catTone(category)}>{categoryLabel}</s-badge>],
              ['Version', 'v' + version],
              ['Status', <StatusBadge key="s" status={status} />],
            ]} />

            {deployment && (
              <>
                <s-divider />
                <s-stack gap="small-100">
                  <s-text type="strong">Deployment</s-text>
                  <s-stack direction="inline" gap="small-100">
                    <s-badge>{RUNTIME_LABEL[deployment.runtime] ?? deployment.runtime}</s-badge>
                    {deployment.requiresPlan === 'plus' ? <s-badge tone="warning">Takes effect on Shopify Plus</s-badge> : null}
                    {deployment.runtimeShipped === false ? <s-badge tone="warning">Runtime pending in this app build</s-badge> : null}
                  </s-stack>
                  <s-text color="subdued">{deployment.note}</s-text>
                </s-stack>
              </>
            )}

            <s-divider />
            <s-stack gap="small-100">
              <s-text type="strong">Placement</s-text>
              <s-text color="subdued">{placement}</s-text>
            </s-stack>

            <s-divider />
            <s-stack gap="small-100">
              <s-text type="strong">Data captures</s-text>
              <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
                <s-text color="subdued">
                  {captureCount > 0 ? `${captureCount} captured ${captureCount === 1 ? 'entry' : 'entries'}` : 'No captures yet'}
                </s-text>
                {captureCount > 0 && (
                  <s-button variant="tertiary" href={`/modules/${moduleId}/captures`}>View →</s-button>
                )}
              </s-grid>
            </s-stack>
          </s-stack>
        </s-section>
      </s-stack>
    </s-grid>
  );
}

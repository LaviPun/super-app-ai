import { json } from '@remix-run/node';
import { useLoaderData, useNavigate } from '@remix-run/react';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { findTemplate, getTemplateInstallability, getTemplateReadiness, getExtensionEligibility } from '@superapp/core';
import { shopify } from '~/shopify.server';
import { PreviewService } from '~/services/preview/preview.service';

export async function loader({ request, params }: { request: Request; params: { templateId?: string } }) {
  await shopify.authenticate.admin(request);
  const templateId = String(params.templateId ?? '').trim();
  if (!templateId) throw new Response('Missing template ID', { status: 400 });

  const template = findTemplate(templateId);
  if (!template) throw new Response('Template not found', { status: 404 });

  const readiness = getTemplateReadiness(template);
  const installability = getTemplateInstallability(template);

  // How this template actually deploys (runtime surface, plan requirement, and
  // whether its runtime is shipped in this app build). For Shopify Functions we
  // don't assert shipped-ness here (that depends on the deployed-function
  // manifest, which this route doesn't load) — the note explains deployment.
  const eligibility = getExtensionEligibility(template.spec.type);
  const deployment = {
    runtime: eligibility.runtime,
    note: eligibility.note,
    requiresPlan: eligibility.requiresPlan ?? null,
    runtimeShipped: eligibility.runtime === 'function' ? null : eligibility.runtimeShipped,
  };
  const configRows = Object.entries(template.spec.config as Record<string, unknown>).map(([key, value]) => {
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return [key, type, raw.length > 120 ? `${raw.slice(0, 120)}...` : raw];
  });

  // Same PreviewService the AI builder's live preview and the merchant
  // gallery thumbnails use, so this page shows the real render for the
  // template's canonical spec rather than a raw config dump only.
  let previewHtml: string | null = null;
  try {
    const preview = new PreviewService().render(template.spec);
    if (preview.kind === 'HTML') previewHtml = preview.html;
  } catch {
    previewHtml = null;
  }

  return json({
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      type: template.type,
      tags: template.tags ?? [],
    },
    readiness,
    installability,
    requires: template.spec.requires,
    deployment,
    configRows,
    previewHtml,
  });
}

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

export default function MerchantTemplateDetailRoute() {
  const { template, readiness, installability, requires, deployment, configRows, previewHtml } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <MerchantShell polaris>
      <s-page heading={template.name} inlineSize="base">
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={() => navigate(`/modules?templateId=${encodeURIComponent(template.id)}`)}
        >
          Use template
        </s-button>
        <s-stack direction="inline" gap="small-100" alignItems="center">
          <s-button variant="tertiary" icon="arrow-left" onClick={() => navigate('/modules')}>Modules</s-button>
          <s-text color="subdued">Merchant template detail (limited access)</s-text>
        </s-stack>

        <s-section>
          <s-stack gap="small-100">
            <s-stack direction="inline" gap="small-100">
              <s-badge>{template.type}</s-badge>
              <s-badge>{template.category}</s-badge>
              {installability.ok ? <s-badge tone="success">Installable</s-badge> : <s-badge tone="critical">Needs fixes</s-badge>}
            </s-stack>
            <s-paragraph>{template.description}</s-paragraph>
            {template.tags.length > 0 ? (
              <s-stack direction="inline" gap="small-100">
                {template.tags.map((tag) => (
                  <s-text key={tag} color="subdued">#{tag}</s-text>
                ))}
              </s-stack>
            ) : null}
            <s-text><s-text type="strong">Requires:</s-text> {requires.join(', ') || '—'}</s-text>
          </s-stack>
        </s-section>

        <s-section heading="Preview">
          {previewHtml ? (
            <s-box border="base" borderRadius="base" overflow="hidden">
              <iframe
                title={`Preview of ${template.name}`}
                srcDoc={previewHtml}
                sandbox="allow-scripts allow-same-origin allow-popups"
                style={{ display: 'block', width: '100%', height: 480, border: 0, background: '#fff' }}
              />
            </s-box>
          ) : (
            <s-text color="subdued">No visual preview available for this template type.</s-text>
          )}
        </s-section>

        <s-section heading="Readiness checks">
          <s-stack gap="small-200">
            {readiness.checks.map((check) => (
              <s-stack key={check.id} direction="inline" justifyContent="space-between" alignItems="center" gap="small-100">
                <s-stack gap="none">
                  <s-text type="strong">{check.id}</s-text>
                  <s-text color="subdued">{check.detail}</s-text>
                </s-stack>
                <s-badge tone={check.ok ? 'success' : 'critical'}>{check.ok ? 'Ready' : 'Needs work'}</s-badge>
              </s-stack>
            ))}
            {!installability.ok && (
              <s-stack gap="none">
                {installability.reasons.map((reason) => (
                  <s-text key={reason} tone="critical">{reason}</s-text>
                ))}
              </s-stack>
            )}
          </s-stack>
        </s-section>

        <s-section heading="Deployment">
          <s-stack gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-badge>{RUNTIME_LABEL[deployment.runtime] ?? deployment.runtime}</s-badge>
              {deployment.requiresPlan === 'plus' ? (
                <s-badge tone="caution">Takes effect on Shopify Plus</s-badge>
              ) : null}
              {deployment.runtimeShipped === false ? (
                <s-badge tone="caution">Runtime pending in this app build</s-badge>
              ) : null}
            </s-stack>
            <s-text color="subdued">{deployment.note}</s-text>
          </s-stack>
        </s-section>

        <s-section heading="Template settings (read-only)">
          {configRows.length > 0 ? (
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Setting</s-table-header>
                <s-table-header>Type</s-table-header>
                <s-table-header>Value preview</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {configRows.map((row) => (
                  <s-table-row key={String(row[0])}>
                    <s-table-cell><s-text type="strong">{row[0]}</s-text></s-table-cell>
                    <s-table-cell>{row[1]}</s-table-cell>
                    <s-table-cell><s-text color="subdued">{row[2]}</s-text></s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          ) : (
            <s-text color="subdued">No config keys on this template.</s-text>
          )}
        </s-section>
      </s-page>
    </MerchantShell>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';

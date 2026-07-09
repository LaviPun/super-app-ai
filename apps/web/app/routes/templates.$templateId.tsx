import { json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { Badge, BlockStack, Button, Card, DataTable, InlineStack, Page, Text } from '@shopify/polaris';
import { findTemplate, getTemplateInstallability, getTemplateReadiness } from '@superapp/core';
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
    configRows,
    previewHtml,
  });
}

export default function MerchantTemplateDetailRoute() {
  const { template, readiness, installability, requires, configRows, previewHtml } = useLoaderData<typeof loader>();

  return (
    <Page
      title={template.name}
      subtitle="Merchant template detail (limited access)"
      backAction={{ content: 'Modules', url: '/modules' }}
      primaryAction={{
        content: 'Use template',
        url: `/modules?templateId=${encodeURIComponent(template.id)}`,
      }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack gap="200" wrap>
              <Badge>{template.type}</Badge>
              <Badge>{template.category}</Badge>
              {installability.ok ? <Badge tone="success">Installable</Badge> : <Badge tone="critical">Needs fixes</Badge>}
            </InlineStack>
            <Text as="p" variant="bodyMd">{template.description}</Text>
            {template.tags.length > 0 ? (
              <InlineStack gap="200" wrap>
                {template.tags.map((tag) => (
                  <Text key={tag} as="span" variant="bodySm" tone="subdued">#{tag}</Text>
                ))}
              </InlineStack>
            ) : null}
            <Text as="p" variant="bodySm"><strong>Requires:</strong> {requires.join(', ') || '—'}</Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Preview</Text>
            {previewHtml ? (
              <div style={{ border: '1px solid var(--p-color-border)', borderRadius: 8, overflow: 'hidden' }}>
                <iframe
                  title={`Preview of ${template.name}`}
                  srcDoc={previewHtml}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  style={{ display: 'block', width: '100%', height: 480, border: 0, background: '#fff' }}
                />
              </div>
            ) : (
              <Text as="p" variant="bodySm" tone="subdued">No visual preview available for this template type.</Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Readiness checks</Text>
            <BlockStack gap="150">
              {readiness.checks.map((check) => (
                <InlineStack key={check.id} align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" fontWeight="medium">{check.id}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{check.detail}</Text>
                  </BlockStack>
                  <Badge tone={check.ok ? 'success' : 'critical'}>{check.ok ? 'Ready' : 'Needs work'}</Badge>
                </InlineStack>
              ))}
            </BlockStack>
            {!installability.ok && (
              <BlockStack gap="100">
                {installability.reasons.map((reason) => (
                  <Text key={reason} as="p" variant="bodySm" tone="critical">{reason}</Text>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Template settings (read-only)</Text>
            {configRows.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'text']}
                headings={['Setting', 'Type', 'Value preview']}
                rows={configRows}
              />
            ) : (
              <Text as="p" variant="bodySm" tone="subdued">No config keys on this template.</Text>
            )}
            <InlineStack>
              <Link to="/modules">
                <Button>Back to templates</Button>
              </Link>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

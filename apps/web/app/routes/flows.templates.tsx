import { json, redirect, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, Link } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, TextField, Button, Badge,
  InlineStack, EmptyState, InlineGrid, Select,
} from '@shopify/polaris';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  WORKFLOW_TEMPLATES, WORKFLOW_CATEGORIES,
  findWorkflowTemplate, installTemplate,
} from '@superapp/core';
import crypto from 'crypto';

export async function loader({ request }: { request: Request }) {
  await shopify.authenticate.admin(request);

  const templates = WORKFLOW_TEMPLATES.map(t => ({
    templateId: t.metadata.templateId,
    name: t.metadata.name,
    description: t.metadata.description,
    category: t.metadata.category,
    tags: t.metadata.tags,
    connectors: t.metadata.requiresConnectors.map(c => c.provider),
    version: t.metadata.version,
  }));

  const connectorSet = new Set<string>();
  for (const t of WORKFLOW_TEMPLATES) {
    for (const c of t.metadata.requiresConnectors) {
      connectorSet.add(c.provider);
    }
  }

  return json({
    templates,
    categories: WORKFLOW_CATEGORIES as unknown as string[],
    connectors: Array.from(connectorSet).sort(),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Error('Shop not found');

  const form = await request.formData();
  const templateId = String(form.get('templateId') ?? '');
  const bundle = findWorkflowTemplate(templateId);
  if (!bundle) return json({ error: 'Template not found' }, { status: 404 });

  const workflowId = crypto.randomUUID();
  const workflow = installTemplate(bundle, shop.id, {}, workflowId);

  await prisma.workflowDef.create({
    data: {
      id: workflowId,
      shop: { connect: { id: shop.id } },
      workflowId,
      version: 1,
      name: bundle.metadata.name,
      specJson: JSON.stringify(workflow),
      status: 'draft',
    },
  });

  await new ActivityLogService().log({
    actor: 'MERCHANT',
    action: 'WORKFLOW_TEMPLATE_INSTALLED',
    shopId: shop.id,
    resource: `workflow:${workflowId}`,
    details: { templateId, name: bundle.metadata.name },
  });

  return redirect('/flows');
}

const SORT_OPTIONS = [
  { label: 'Most popular', value: 'popular' },
  { label: 'Newest', value: 'newest' },
  { label: 'A → Z', value: 'az' },
  { label: 'Z → A', value: 'za' },
];

export default function FlowsTemplates() {
  const { templates, categories, connectors } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isInstalling = nav.state !== 'idle';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedConnector, setSelectedConnector] = useState('All');
  const [sortBy, setSortBy] = useState('popular');

  const categoryOptions = [
    { label: 'All categories', value: 'All' },
    ...categories.map(c => ({ label: c, value: c })),
  ];

  const connectorOptions = [
    { label: 'All apps', value: 'All' },
    ...connectors.map(c => ({ label: c.charAt(0).toUpperCase() + c.slice(1), value: c })),
  ];

  let filtered = templates.filter(t => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q));
    const matchesCategory = selectedCategory === 'All' || t.category.includes(selectedCategory);
    const matchesConnector = selectedConnector === 'All' || t.connectors.includes(selectedConnector);
    return matchesSearch && matchesCategory && matchesConnector;
  });

  if (sortBy === 'az') filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'za') filtered = [...filtered].sort((a, b) => b.name.localeCompare(a.name));

  return (
    <Page title="Browse templates" backAction={{ content: 'Workflows', url: '/flows' }}>
      <BlockStack gap="500">
        {/* Hero banner */}
        <div style={{
          background: 'linear-gradient(135deg, #1a3a2a 0%, #2d6a4f 100%)',
          borderRadius: 16,
          padding: '40px 32px',
          color: '#fff',
        }}>
          <BlockStack gap="200">
            <Text as="h2" variant="headingXl"><span style={{ color: '#fff' }}>Browse templates</span></Text>
            <Text as="p" variant="bodyMd">
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>
                Find pre-built workflows to accelerate your business. Search by describing
                what you would like to automate or filter by category and app.
              </span>
            </Text>
          </BlockStack>
        </div>

        {/* Filters row */}
        <InlineGrid columns={{ xs: 1, sm: 4 }} gap="300">
          <TextField
            label="Search"
            labelHidden
            placeholder="Describe what you would like to automate"
            value={searchQuery}
            onChange={setSearchQuery}
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setSearchQuery('')}
          />
          <Select
            label="Apps"
            labelHidden
            options={connectorOptions}
            value={selectedConnector}
            onChange={setSelectedConnector}
          />
          <Select
            label="Categories"
            labelHidden
            options={categoryOptions}
            value={selectedCategory}
            onChange={setSelectedCategory}
          />
          <Select
            label="Sort by"
            labelHidden
            options={SORT_OPTIONS}
            value={sortBy}
            onChange={setSortBy}
          />
        </InlineGrid>

        {/* Result count */}
        <InlineStack align="space-between" blockAlign="center">
          <Text as="p" variant="bodySm" tone="subdued">{`${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}</Text>
        </InlineStack>

        {/* Template card grid */}
        {filtered.length > 0 ? (
          <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
            {filtered.map(t => (
              <Card key={t.templateId}>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">{t.name}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{t.description}</Text>
                  <InlineStack gap="200" wrap>
                    {t.category.map(c => (
                      <Badge key={c}>{c}</Badge>
                    ))}
                  </InlineStack>
                  <InlineStack gap="200" wrap>
                    {t.connectors.map(c => (
                      <Badge key={c} tone="info">{c}</Badge>
                    ))}
                  </InlineStack>
                  <InlineStack gap="200" wrap>
                    {t.tags.slice(0, 4).map(tag => (
                      <Text key={tag} as="span" variant="bodySm" tone="subdued">#{tag}</Text>
                    ))}
                  </InlineStack>
                  <Form method="post">
                    <input type="hidden" name="templateId" value={t.templateId} />
                    <Button submit size="slim" variant="primary" loading={isInstalling}>
                      Install template
                    </Button>
                  </Form>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        ) : (
          <Card>
            <EmptyState heading="No templates match your filters" image="">
              <p>Try a different search term, category, or app filter.</p>
            </EmptyState>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

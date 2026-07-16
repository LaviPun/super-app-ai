import { json, redirect, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, useNavigate } from '@remix-run/react';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  WORKFLOW_TEMPLATES, WORKFLOW_CATEGORIES,
  findWorkflowTemplate, installTemplate,
} from '@superapp/core';
import crypto from 'crypto';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { EmptyState } from '~/components/merchant/polaris';

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

// Only sorts backed by real data. "Most popular" / "Newest" were dropped:
// there is no cross-merchant install telemetry to rank popularity, and no
// reliable template timestamp — offering them implied a ranking that doesn't exist.
const SORT_OPTIONS = [
  { label: 'A → Z', value: 'az' },
  { label: 'Z → A', value: 'za' },
];

export default function FlowsTemplates() {
  return (
    <MerchantShell polaris>
      <FlowsTemplatesBody />
    </MerchantShell>
  );
}

function FlowsTemplatesBody() {
  const { templates, categories, connectors } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const nav = useNavigation();
  const isInstalling = nav.state !== 'idle';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedConnector, setSelectedConnector] = useState('All');
  const [sortBy, setSortBy] = useState('az');

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
    <s-page heading="Browse templates" inlineSize="base">
      <s-stack gap="small-100">
        <s-stack direction="inline">
          <s-button variant="tertiary" icon="arrow-left" onClick={() => navigate('/flows')}>Workflows</s-button>
        </s-stack>
        <s-paragraph color="subdued">
          Find pre-built workflows to accelerate your business. Search by describing what you would
          like to automate or filter by category and app.
        </s-paragraph>
      </s-stack>

      <s-grid gridTemplateColumns="2fr 1fr 1fr 1fr" gap="small-100">
        <s-search-field
          label="Search templates"
          labelAccessibilityVisibility="exclusive"
          placeholder="Describe what you would like to automate"
          value={searchQuery}
          onInput={(e) => setSearchQuery(e.currentTarget.value ?? '')}
        />
        <s-select
          label="Apps"
          labelAccessibilityVisibility="exclusive"
          value={selectedConnector}
          onChange={(e) => setSelectedConnector(e.currentTarget.value)}
        >
          <s-option value="All">All apps</s-option>
          {connectors.map(c => (
            <s-option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</s-option>
          ))}
        </s-select>
        <s-select
          label="Categories"
          labelAccessibilityVisibility="exclusive"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.currentTarget.value)}
        >
          <s-option value="All">All categories</s-option>
          {categories.map(c => (
            <s-option key={c} value={c}>{c}</s-option>
          ))}
        </s-select>
        <s-select
          label="Sort by"
          labelAccessibilityVisibility="exclusive"
          value={sortBy}
          onChange={(e) => setSortBy(e.currentTarget.value)}
        >
          {SORT_OPTIONS.map(o => (
            <s-option key={o.value} value={o.value}>{o.label}</s-option>
          ))}
        </s-select>
      </s-grid>

      <s-text color="subdued">{`${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}</s-text>

      {filtered.length > 0 ? (
        <s-grid gridTemplateColumns="repeat(auto-fill, minmax(280px, 1fr))" gap="base">
          {filtered.map(t => (
            <s-box key={t.templateId} border="base" borderRadius="base" background="base" padding="base">
              <s-stack gap="small-100">
                <s-text type="strong">{t.name}</s-text>
                <s-text color="subdued">{t.description}</s-text>
                <s-stack direction="inline" gap="small-200">
                  {t.category.map(c => (
                    <s-badge key={c}>{c}</s-badge>
                  ))}
                  {t.connectors.map(c => (
                    <s-badge key={c} tone="info">{c}</s-badge>
                  ))}
                </s-stack>
                {t.tags.length > 0 && (
                  <s-text color="subdued">{t.tags.slice(0, 4).map(tag => `#${tag}`).join(' ')}</s-text>
                )}
                <Form method="post">
                  <input type="hidden" name="templateId" value={t.templateId} />
                  <s-button type="submit" variant="primary" loading={isInstalling || undefined}>
                    Install template
                  </s-button>
                </Form>
              </s-stack>
            </s-box>
          ))}
        </s-grid>
      ) : (
        <s-section>
          <EmptyState icon="automation" heading="No templates match your filters">
            Try a different search term, category, or app filter.
          </EmptyState>
        </s-section>
      )}
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';

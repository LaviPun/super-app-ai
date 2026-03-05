import { json } from '@remix-run/node';
import { useLoaderData, Form, Link, useNavigation, useSearchParams, useFetcher, useNavigate } from '@remix-run/react';
import {
  Page, Card, TextField, Button, BlockStack, Text, Badge,
  DataTable, InlineStack, EmptyState, SkeletonBodyText, Banner,
  InlineGrid, Divider, Tabs, Select, Spinner,
} from '@shopify/polaris';
import { useState, useCallback, useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MODULE_TEMPLATES, TEMPLATE_CATEGORIES, ALL_MODULE_TYPES } from '@superapp/core';
import { getTypeDisplayLabel, getTypeTone } from '~/utils/type-label';

type RecipeOption = {
  index: number;
  explanation: string;
  recipe: Record<string, unknown>;
};

const EMPTY_LOADER_DATA = {
  modules: [] as { id: string; name: string; type: string; category: string; status: string; latestVersion: number; updatedAt: string }[],
  stats: { total: 0, published: 0, drafts: 0 },
  typeCounts: {} as Record<string, number>,
  templates: [] as { id: string; name: string; description: string; category: string; type: string; tags: string[] }[],
  categories: [] as string[],
  types: [] as string[],
  loaderError: undefined as string | undefined,
};

export async function loader({ request }: { request: Request }) {
  try {
    const { session } = await shopify.authenticate.admin(request);
    const prisma = getPrisma();

    let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
    if (!shopRow) {
      shopRow = await prisma.shop.create({
        data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
      });
    }

    const modules = await prisma.module.findMany({
      where: { shopId: shopRow.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
        activeVersion: true,
      },
      take: 100,
    });

    const published = modules.filter(m => m.status === 'PUBLISHED').length;
    const drafts = modules.filter(m => m.status === 'DRAFT').length;

    const typeCounts: Record<string, number> = {};
    for (const m of modules) {
      typeCounts[m.type] = (typeCounts[m.type] ?? 0) + 1;
    }

    const templates = MODULE_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      type: t.type,
      tags: t.tags ?? [],
    }));

    return json({
      modules: modules.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        category: m.category,
        status: m.status,
        latestVersion: m.versions[0]?.version ?? 1,
        updatedAt: new Date(m.updatedAt).toISOString(),
      })),
      stats: { total: modules.length, published, drafts },
      typeCounts,
      templates,
      categories: TEMPLATE_CATEGORIES as unknown as string[],
      types: [...ALL_MODULE_TYPES].sort(),
      loaderError: undefined,
    });
  } catch (err) {
    let message: string;
    let status = 500;
    if (err instanceof Response) {
      status = err.status;
      message = err.status === 401 ? 'Session expired or not authenticated.' : `Request failed: ${err.status} ${err.statusText || 'Error'}.`;
    } else if (err instanceof Error) {
      message = err.message;
    } else {
      message = String(err);
    }
    return json(
      { ...EMPTY_LOADER_DATA, loaderError: message },
      { status }
    );
  }
}

export default function ModulesIndex() {
  const { modules, stats, typeCounts, templates, categories, types, loaderError } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = nav.state === 'submitting';
  const isLoading = nav.state === 'loading';
  const [filterTab, setFilterTab] = useState(0);
  const [createMode, setCreateMode] = useState<'ai' | 'template'>('ai');

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const typeFilter = searchParams.get('type') ?? null;

  const [prompt, setPrompt] = useState('');
  const [aiPreferredType, setAiPreferredType] = useState<string>('Auto');
  const [aiPreferredCategory, setAiPreferredCategory] = useState<string>('Auto');
  const [aiPreferredBlockType, setAiPreferredBlockType] = useState<string>('Auto');
  const [tplSearch, setTplSearch] = useState('');
  const [tplCategory, setTplCategory] = useState('All');
  const [tplType, setTplType] = useState('All');
  const [tplSort, setTplSort] = useState('popular');

  const proposeFetcher = useFetcher<{ options?: RecipeOption[]; error?: string }>();
  const confirmFetcher = useFetcher<{ moduleId?: string; error?: string }>();
  const [aiOptions, setAiOptions] = useState<RecipeOption[] | null>(null);
  const isGenerating = proposeFetcher.state !== 'idle';
  const isConfirming = confirmFetcher.state !== 'idle';

  useEffect(() => {
    if (proposeFetcher.data?.options) {
      setAiOptions(proposeFetcher.data.options);
    }
  }, [proposeFetcher.data]);

  useEffect(() => {
    if (confirmFetcher.data?.moduleId) {
      navigate(`/modules/${confirmFetcher.data.moduleId}`);
    }
  }, [confirmFetcher.data, navigate]);

  const handleGenerate = useCallback(() => {
    setAiOptions(null);
    const formData = new FormData();
    formData.set('prompt', prompt);
    formData.set('preferredType', aiPreferredType);
    formData.set('preferredCategory', aiPreferredCategory);
    formData.set('preferredBlockType', aiPreferredBlockType);
    proposeFetcher.submit(formData, { method: 'post', action: '/api/ai/create-module' });
  }, [prompt, aiPreferredType, aiPreferredCategory, aiPreferredBlockType, proposeFetcher]);

  const handleSelectOption = useCallback((recipe: Record<string, unknown>) => {
    const formData = new FormData();
    formData.set('spec', JSON.stringify(recipe));
    confirmFetcher.submit(formData, { method: 'post', action: '/api/ai/create-module-from-recipe' });
  }, [confirmFetcher]);

  let filteredModules = filterTab === 0
    ? modules
    : filterTab === 1
      ? modules.filter(m => m.status === 'PUBLISHED')
      : modules.filter(m => m.status === 'DRAFT');
  if (typeFilter) {
    filteredModules = filteredModules.filter(m => m.type === typeFilter);
  }

  const categoryOptions = [
    { label: 'All categories', value: 'All' },
    ...categories.map(c => ({ label: c.replace(/_/g, ' '), value: c })),
  ];

  const typeOptions = [
    { label: 'All types', value: 'All' },
    ...types.map(t => ({ label: t, value: t })),
  ];

  const sortOptions = [
    { label: 'Most popular', value: 'popular' },
    { label: 'A → Z', value: 'az' },
    { label: 'Z → A', value: 'za' },
  ];

  let filteredTemplates = templates.filter(t => {
    const q = tplSearch.toLowerCase();
    const matchesSearch = !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag: string) => tag.toLowerCase().includes(q));
    const matchesCategory = tplCategory === 'All' || t.category === tplCategory;
    const matchesType = tplType === 'All' || t.type === tplType;
    return matchesSearch && matchesCategory && matchesType;
  });

  if (tplSort === 'az') filteredTemplates = [...filteredTemplates].sort((a, b) => a.name.localeCompare(b.name));
  else if (tplSort === 'za') filteredTemplates = [...filteredTemplates].sort((a, b) => b.name.localeCompare(a.name));

  const tabs = [
    { id: 'all', content: `All (${stats.total})` },
    { id: 'published', content: `Published (${stats.published})` },
    { id: 'drafts', content: `Drafts (${stats.drafts})` },
  ];

  if (!mounted) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Spinner accessibilityLabel="Loading modules" size="large" />
      </div>
    );
  }

  return (
    <Page title="Modules" backAction={{ content: 'Dashboard', url: '/' }}>
      <BlockStack gap="500">
        {loaderError && (
          <Banner tone="critical" title="Could not load modules" onDismiss={() => {}}>
            {loaderError}
          </Banner>
        )}
        {/* ─── Create mode toggle ─── */}
        <InlineStack gap="200">
          <Button
            variant={createMode === 'ai' ? 'primary' : 'secondary'}
            onClick={() => setCreateMode('ai')}
          >
            Generate with AI
          </Button>
          <Button
            variant={createMode === 'template' ? 'primary' : 'secondary'}
            onClick={() => setCreateMode('template')}
          >
            From Template
          </Button>
        </InlineStack>

        {/* ─── AI Builder ─── */}
        {createMode === 'ai' && (
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">AI Module Builder</Text>
                  <Badge tone="magic">AI-powered</Badge>
                </InlineStack>
                <Text as="p" tone="subdued">
                  Describe what you want and AI will generate 3 options for you to choose from. Each option has unique settings, controls, and styling.
                </Text>
                <BlockStack gap="300">
                  <div>
                    <Text as="label" variant="bodyMd" fontWeight="medium">
                      What do you want to build?
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
                        placeholder='e.g. "Discount popup: shows 5s after load on product page, visitor can copy coupon code and click CTA. Mobile-friendly."'
                        rows={3}
                        autoComplete="off"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--p-color-border)',
                          fontFamily: 'inherit',
                          fontSize: 14,
                          resize: 'vertical',
                          minHeight: 80,
                        }}
                      />
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Best results: say what it is, who sees it, when (e.g. after 5s, exit intent), and what they can do. Add any extras (coupon to copy, one CTA, mobile-friendly).
                    </Text>
                  </div>
                  <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                    <Select
                      label="Module type"
                      options={[
                        { label: 'Auto', value: 'Auto' },
                        ...types.map((t) => ({ label: getTypeDisplayLabel(t), value: t })),
                      ]}
                      value={aiPreferredType}
                      onChange={setAiPreferredType}
                      helpText="Let AI choose, or pick a specific type."
                    />
                    <Select
                      label="Category"
                      options={[
                        { label: 'Auto', value: 'Auto' },
                        ...categories.map((c) => ({ label: c.replace(/_/g, ' '), value: c })),
                      ]}
                      value={aiPreferredCategory}
                      onChange={setAiPreferredCategory}
                      helpText="e.g. Storefront UI, Function."
                    />
                    <Select
                      label="Block type"
                      options={[
                        { label: 'Auto', value: 'Auto' },
                        { label: 'Order status', value: 'customer-account.order-status.block.render' },
                        { label: 'Order index', value: 'customer-account.order-index.block.render' },
                        { label: 'Profile', value: 'customer-account.profile.block.render' },
                        { label: 'Custom page', value: 'customer-account.page.render' },
                      ]}
                      value={aiPreferredBlockType}
                      onChange={setAiPreferredBlockType}
                      helpText="For customer account blocks only."
                    />
                  </InlineGrid>
                  <InlineStack align="start" gap="200">
                    <Button variant="primary" loading={isGenerating} disabled={!prompt.trim() || isGenerating} onClick={handleGenerate}>
                      Generate 3 options
                    </Button>
                    {aiOptions && (
                      <Button onClick={() => setAiOptions(null)}>Clear results</Button>
                    )}
                  </InlineStack>
                </BlockStack>
                {isGenerating && (
                  <Banner tone="info">
                    <InlineStack gap="200" blockAlign="center">
                      <Spinner size="small" />
                      <Text as="p">AI is generating 3 options -- this typically takes 15-40 seconds...</Text>
                    </InlineStack>
                  </Banner>
                )}
                {proposeFetcher.data?.error && !isGenerating && (
                  <Banner tone="critical">
                    <Text as="p">{proposeFetcher.data.error}</Text>
                  </Banner>
                )}
                {confirmFetcher.data?.error && !isConfirming && (
                  <Banner tone="critical">
                    <Text as="p">{confirmFetcher.data.error}</Text>
                  </Banner>
                )}
              </BlockStack>
            </Card>

            {/* ─── AI Options Cards ─── */}
            {aiOptions && aiOptions.length > 0 && (
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Choose an option</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  AI generated {aiOptions.length} option{aiOptions.length !== 1 ? 's' : ''}. Each has different settings, controls, and styling. Pick the one that best fits your needs.
                </Text>
                <InlineGrid columns={{ xs: 1, md: aiOptions.length >= 3 ? 3 : aiOptions.length }} gap="400">
                  {aiOptions.map((opt, i) => {
                    const r = opt.recipe as Record<string, unknown>;
                    const config = r.config as Record<string, unknown> | undefined;
                    const hasStyle = !!r.style;
                    return (
                      <Card key={i}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingSm">Option {i + 1}</Text>
                            <Badge tone={getTypeTone(String(r.type ?? ''))}>{getTypeDisplayLabel(String(r.type ?? ''))}</Badge>
                          </InlineStack>
                          <Divider />
                          <Text as="p" variant="bodyMd">{opt.explanation}</Text>
                          <Divider />
                          <BlockStack gap="100">
                            <Text as="p" variant="bodySm" fontWeight="semibold">Name</Text>
                            <Text as="p" variant="bodySm">{String(r.name ?? '—')}</Text>
                          </BlockStack>
                          {config && (
                            <BlockStack gap="100">
                              <Text as="p" variant="bodySm" fontWeight="semibold">Settings</Text>
                              <BlockStack gap="050">
                                {Object.entries(config).slice(0, 6).map(([k, v]) => (
                                  <Text key={k} as="p" variant="bodySm" tone="subdued">
                                    {k}: {typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60)}
                                  </Text>
                                ))}
                                {Object.keys(config).length > 6 && (
                                  <Text as="p" variant="bodySm" tone="subdued">+{Object.keys(config).length - 6} more...</Text>
                                )}
                              </BlockStack>
                            </BlockStack>
                          )}
                          {hasStyle && (
                            <BlockStack gap="100">
                              <Text as="p" variant="bodySm" fontWeight="semibold">Styling</Text>
                              <Text as="p" variant="bodySm" tone="subdued">Custom layout, colors, spacing, and typography included</Text>
                            </BlockStack>
                          )}
                          <Button
                            variant="primary"
                            fullWidth
                            loading={isConfirming}
                            disabled={isConfirming}
                            onClick={() => handleSelectOption(r)}
                          >
                            Use this option
                          </Button>
                        </BlockStack>
                      </Card>
                    );
                  })}
                </InlineGrid>
              </BlockStack>
            )}
          </BlockStack>
        )}

        {/* ─── Template browser (Shopify Flow style) ─── */}
        {createMode === 'template' && (
          <BlockStack gap="500">
            <div style={{
              background: 'linear-gradient(135deg, #1a3052 0%, #2d4a8f 100%)',
              borderRadius: 16,
              padding: '32px 28px',
              color: '#fff',
            }}>
              <BlockStack gap="200">
                <Text as="h2" variant="headingXl"><span style={{ color: '#fff' }}>Module templates</span></Text>
                <Text as="p" variant="bodyMd">
                  <span style={{ color: 'rgba(255,255,255,0.85)' }}>
                    Pick a pre-built module template to get started instantly. Customize everything after creation.
                  </span>
                </Text>
              </BlockStack>
            </div>

            <InlineGrid columns={{ xs: 1, sm: 4 }} gap="300">
              <TextField
                label="Search"
                labelHidden
                placeholder="Search templates..."
                value={tplSearch}
                onChange={setTplSearch}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setTplSearch('')}
              />
              <Select
                label="Category"
                labelHidden
                options={categoryOptions}
                value={tplCategory}
                onChange={setTplCategory}
              />
              <Select
                label="Type"
                labelHidden
                options={typeOptions}
                value={tplType}
                onChange={setTplType}
              />
              <Select
                label="Sort by"
                labelHidden
                options={sortOptions}
                value={tplSort}
                onChange={setTplSort}
              />
            </InlineGrid>

            <Text as="p" variant="bodySm" tone="subdued">
              {`${filteredTemplates.length} template${filteredTemplates.length !== 1 ? 's' : ''}`}
            </Text>

            {filteredTemplates.length > 0 ? (
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                {filteredTemplates.map(t => (
                  <Card key={t.id}>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">{t.name}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{t.description}</Text>
                      <InlineStack gap="200" wrap>
                        <Badge>{t.category.replace(/_/g, ' ')}</Badge>
                        <Badge tone={getTypeTone(t.type)}>{getTypeDisplayLabel(t.type)}</Badge>
                      </InlineStack>
                      {t.tags.length > 0 && (
                        <InlineStack gap="200" wrap>
                          {t.tags.slice(0, 4).map((tag: string) => (
                            <Text key={tag} as="span" variant="bodySm" tone="subdued">#{tag}</Text>
                          ))}
                        </InlineStack>
                      )}
                      <Form method="post" action="/api/modules/from-template">
                        <input type="hidden" name="templateId" value={t.id} />
                        <Button submit size="slim" variant="primary" loading={isSubmitting}>
                          Use template
                        </Button>
                      </Form>
                    </BlockStack>
                  </Card>
                ))}
              </InlineGrid>
            ) : (
              <Card>
                <EmptyState heading="No templates match your filters" image="">
                  <p>Try a different search term, category, or type filter.</p>
                </EmptyState>
              </Card>
            )}
          </BlockStack>
        )}

        {/* ─── Stats row ─── */}
        <InlineGrid columns={{ xs: 3, sm: 3 }} gap="300">
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Total</Text>
              <Text as="p" variant="headingLg">{stats.total}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Published</Text>
              <Text as="p" variant="headingLg" tone="success">{stats.published}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Drafts</Text>
              <Text as="p" variant="headingLg">{stats.drafts}</Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* ─── Type breakdown ─── */}
        {Object.keys(typeCounts).length > 0 && (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">By type</Text>
              <InlineStack gap="300" wrap>
                {Object.entries(typeCounts).map(([type, count]) => (
                  <Link key={type} to={typeFilter === type ? '/modules' : `/modules?type=${encodeURIComponent(type)}`}>
                    <Badge tone={getTypeTone(type)}>{`${getTypeDisplayLabel(type)}: ${count}`}</Badge>
                  </Link>
                ))}
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* ─── Modules table with filter tabs ─── */}
        <Card>
          <BlockStack gap="300">
            <Tabs tabs={tabs} selected={filterTab} onSelect={setFilterTab} />
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : filteredModules.length === 0 ? (
              <EmptyState heading={filterTab === 0 ? 'No modules yet' : 'No modules in this category'} image="">
                <p>{filterTab === 0 ? 'Use the AI builder or pick a template to create your first module.' : 'Try a different filter or create a new module.'}</p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text', 'text']}
                headings={['Name', 'Type', 'Category', 'Status', 'Version', 'Updated', '']}
                rows={filteredModules.map(m => [
                  m.name,
                  <Badge key={`t-${m.id}`} tone={getTypeTone(m.type)}>{getTypeDisplayLabel(m.type)}</Badge>,
                  m.category,
                  <Badge key={`s-${m.id}`} tone={m.status === 'PUBLISHED' ? 'success' : 'attention'}>
                    {m.status}
                  </Badge>,
                  m.latestVersion,
                  new Date(m.updatedAt).toLocaleDateString(),
                  <Link key={m.id} to={`/modules/${m.id}`}>
                    <Button size="slim">View</Button>
                  </Link>,
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

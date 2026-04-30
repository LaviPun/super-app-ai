import { json } from '@remix-run/node';
import { useLoaderData, Form, Link, useNavigation, useNavigate, useSearchParams, useFetcher, useRevalidator } from '@remix-run/react';
import {
  Page, Card, TextField, Button, BlockStack, Text, Badge,
  DataTable, InlineStack, EmptyState, SkeletonBodyText, Banner,
  InlineGrid, Divider, Tabs, Select, Spinner, Box,
} from '@shopify/polaris';
import { useState, useCallback, useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import {
  MODULE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  MODULE_TYPES_DISPLAY_ORDER,
  getTemplateReadiness,
  getTemplateInstallability,
} from '@superapp/core';
import { INTENT_EXAMPLES } from '~/services/ai/intent-examples';
import { getTypeDisplayLabel, getTypeTone, getCategoryDisplayLabel } from '~/utils/type-label';

type RecipeOption = {
  index: number;
  explanation: string;
  recipe: Record<string, unknown>;
};

type TemplateQualityFilter = 'All' | 'Advanced ready' | 'Data-save ready' | 'DB-backed';

const DB_MESSAGES = [
  'Classifying request...',
  'Building validated RecipeSpec...',
  'Preparing options...',
];

function AIGeneratingAnimation({ label }: { label?: string }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % DB_MESSAGES.length), 1700);
    return () => clearInterval(t);
  }, []);

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Spinner size="small" accessibilityLabel="Generating module options" />
            <Text as="p" variant="bodyMd" fontWeight="medium">
              {DB_MESSAGES[msgIdx]}
            </Text>
          </InlineStack>
          {label && (
            <Text as="p" variant="bodySm" tone="subdued">
              {label}
            </Text>
          )}
        </InlineStack>
        <Text as="p" variant="bodySm" tone="subdued">
          We are validating output against your module schema and preparing three safe options.
        </Text>
      </BlockStack>
    </Card>
  );
}

/** Curated example prompts shown as "Try:" chips in the AI builder. */
const EXAMPLE_PROMPTS: string[] = [
  INTENT_EXAMPLES['promo.popup']?.[0] ?? 'Add a popup with 10% off for new visitors',
  INTENT_EXAMPLES['utility.announcement']?.[0] ?? 'Announcement bar at the top of every page',
  INTENT_EXAMPLES['utility.floating_widget']?.[0] ?? 'Floating WhatsApp chat button',
  INTENT_EXAMPLES['utility.effect']?.[0] ?? 'Add falling snow for Christmas',
  INTENT_EXAMPLES['upsell.cart_upsell']?.[0] ?? 'Show related products at checkout',
  INTENT_EXAMPLES['engage.newsletter_capture']?.[0] ?? 'Email capture popup for newsletter signup',
  INTENT_EXAMPLES['functions.discountRules']?.[0] ?? 'Give 20% off to VIP customers',
  INTENT_EXAMPLES['flow.create_workflow']?.[0] ?? 'Send email when an order is tagged',
];

const EMPTY_LOADER_DATA = {
  modules: [] as { id: string; name: string; type: string; category: string; status: string; latestVersion: number; updatedAt: string }[],
  stats: { total: 0, published: 0, drafts: 0 },
  typeCounts: {} as Record<string, number>,
  templates: [] as {
    id: string;
    name: string;
    description: string;
    category: string;
    type: string;
    tags: string[];
    hasAdvancedSettings: boolean;
    dataSaveReady: boolean;
    storageMode: string;
    dbModels: string[];
    installable: boolean;
    installReasons: string[];
  }[],
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

    const templates = MODULE_TEMPLATES.map(t => {
      const readiness = getTemplateReadiness(t);
      const installability = getTemplateInstallability(t);
      return {
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      type: t.type,
      tags: t.tags ?? [],
      hasAdvancedSettings: readiness.hasAdvancedSettings,
      dataSaveReady: readiness.dataSaveReady,
      storageMode: readiness.storageMode,
      dbModels: readiness.dbModels,
      installable: installability.ok,
      installReasons: installability.reasons,
    };
    });

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
      types: [...MODULE_TYPES_DISPLAY_ORDER],
      loaderError: undefined as string | undefined,
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

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
      }}
      title={id}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--p-font-mono, monospace)', fontSize: 11,
        color: copied ? '#008060' : '#6d7175', padding: '2px 4px',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓ Copied' : `${id.slice(0, 8)}… ⎘`}
    </button>
  );
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
  const [loaderErrorDismissed, setLoaderErrorDismissed] = useState(false);
  const { revalidate } = useRevalidator();

  useEffect(() => {
    setMounted(true);
    // Reflect agent writes: poll every 30s + revalidate on window focus
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener('focus', revalidate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', revalidate);
    };
  }, [revalidate]);

  const typeFilter = searchParams.get('type') ?? null;

  const [prompt, setPrompt] = useState('');
  const [aiPreferredType, setAiPreferredType] = useState<string>('Auto');
  const [aiPreferredCategory, setAiPreferredCategory] = useState<string>('Auto');
  const [aiPreferredBlockType, setAiPreferredBlockType] = useState<string>('Auto');
  const [tplSearch, setTplSearch] = useState('');
  const [tplCategory, setTplCategory] = useState('All');
  const [tplType, setTplType] = useState('All');
  const [tplSort, setTplSort] = useState('popular');
  const [tplQuality, setTplQuality] = useState<TemplateQualityFilter>('All');

  const proposeFetcher = useFetcher<{ options?: RecipeOption[]; error?: string; message?: string }>();
  const confirmFetcher = useFetcher<{ moduleId?: string; error?: string }>();
  const [aiOptions, setAiOptions] = useState<RecipeOption[] | null>(null);
  const [builderOpen, setBuilderOpen] = useState(true);
  const isGenerating = proposeFetcher.state !== 'idle';
  const isConfirming = confirmFetcher.state !== 'idle';

  useEffect(() => {
    if (proposeFetcher.data?.options && proposeFetcher.state === 'idle') {
      setAiOptions(proposeFetcher.data.options);
      setBuilderOpen(false);
    }
  }, [proposeFetcher.data, proposeFetcher.state]);

  useEffect(() => {
    if (confirmFetcher.data?.moduleId && confirmFetcher.state === 'idle') {
      navigate(`/modules/${confirmFetcher.data.moduleId}`);
    }
  }, [confirmFetcher.data, confirmFetcher.state, navigate]);

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

  const handleStartFresh = useCallback(() => {
    setAiOptions(null);
    setPrompt('');
    setAiPreferredType('Auto');
    setAiPreferredCategory('Auto');
    setAiPreferredBlockType('Auto');
    setBuilderOpen(true);
  }, []);

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

  const qualityOptions = [
    { label: 'All quality levels', value: 'All' },
    { label: 'Advanced settings ready', value: 'Advanced ready' },
    { label: 'Data-save ready', value: 'Data-save ready' },
    { label: 'DB-backed templates', value: 'DB-backed' },
  ];

  let filteredTemplates = templates.filter(t => {
    const q = tplSearch.toLowerCase();
    const matchesSearch = !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag: string) => tag.toLowerCase().includes(q));
    const matchesCategory = tplCategory === 'All' || t.category === tplCategory;
    const matchesType = tplType === 'All' || t.type === tplType;
    const matchesQuality =
      tplQuality === 'All'
      || (tplQuality === 'Advanced ready' && t.hasAdvancedSettings)
      || (tplQuality === 'Data-save ready' && t.dataSaveReady)
      || (tplQuality === 'DB-backed' && t.dbModels.length > 0);
    return matchesSearch && matchesCategory && matchesType && matchesQuality;
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
        <style>{`
          .Modules-templateCard {
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          .Modules-templateCardBody {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
          }
          .Modules-templateAction {
            margin-top: auto;
            padding-top: 8px;
          }
          .Modules-tableHeader {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
          }
          .Modules-rowName {
            max-width: 280px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 500;
          }
          .Modules-rowUpdated {
            white-space: nowrap;
            color: var(--p-color-text-subdued);
            font-size: 0.8125rem;
          }
          .Modules-rowAction {
            min-width: 70px;
            display: inline-flex;
            justify-content: flex-end;
          }
        `}</style>
        {loaderError && !loaderErrorDismissed && (
          <Banner tone="critical" title="Could not load modules" onDismiss={() => setLoaderErrorDismissed(true)}>
            {loaderError}
          </Banner>
        )}
        {/* ─── Create mode toggle ─── */}
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd" fontWeight="semibold">Create a module</Text>
          <Tabs
            tabs={[
              { id: 'ai', content: 'Generate with AI' },
              { id: 'template', content: 'From template' },
            ]}
            selected={createMode === 'ai' ? 0 : 1}
            onSelect={(i) => setCreateMode(i === 0 ? 'ai' : 'template')}
          />
        </BlockStack>

        {/* ─── AI Builder ─── */}
        {createMode === 'ai' && (
          <BlockStack gap="400">
            <Card padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">AI Module Builder</Text>
                    <Badge tone="magic">AI-powered</Badge>
                  </InlineStack>
                  <InlineStack gap="200">
                    {aiOptions && !builderOpen && (
                      <Button size="slim" onClick={() => setBuilderOpen(true)}>Edit prompt</Button>
                    )}
                    {aiOptions && (
                      <Button size="slim" onClick={handleStartFresh}>Start fresh</Button>
                    )}
                  </InlineStack>
                </InlineStack>

                {/* Compact prompt summary when collapsed */}
                {aiOptions && !builderOpen && !isGenerating && (
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      <em>"{prompt.length > 100 ? prompt.slice(0, 100) + '…' : prompt}"</em>
                    </Text>
                  </Box>
                )}

                {/* Full form — shown when builder is open and not generating */}
                {(builderOpen || !aiOptions) && !isGenerating && (
                  <BlockStack gap="400">
                    <Text as="p" tone="subdued" variant="bodyMd">
                      Describe what you want — AI generates 3 distinct options with unique settings and styling.
                    </Text>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" fontWeight="medium">Example prompts</Text>
                      <InlineStack gap="200" wrap>
                        {EXAMPLE_PROMPTS.map((ex) => (
                          <Button key={ex} size="slim" variant="tertiary" onClick={() => setPrompt(ex)}>
                            {ex.length > 42 ? ex.slice(0, 42) + '…' : ex}
                          </Button>
                        ))}
                      </InlineStack>
                    </BlockStack>
                    <TextField
                      label="What do you want to build?"
                      labelHidden
                      value={prompt}
                      onChange={setPrompt}
                      placeholder='e.g. "Discount popup: shows 5s after load on product page, visitor can copy coupon code and click CTA. Mobile-friendly."'
                      autoComplete="off"
                      multiline={3}
                      helpText="Tip: include who sees it, when (5s delay, exit intent), and what they can do (copy coupon, click CTA)."
                    />
                    <InlineGrid columns={{ xs: 1, sm: aiPreferredType === 'Auto' || aiPreferredType === 'customerAccount.blocks' ? 3 : 2 }} gap="300">
                      <Select
                        label="Module type"
                        options={[
                          { label: 'Auto', value: 'Auto' },
                          ...types.map((t) => ({ label: getTypeDisplayLabel(t), value: t })),
                        ]}
                        value={aiPreferredType}
                        onChange={(v) => { setAiPreferredType(v); if (v !== 'Auto' && v !== 'customerAccount.blocks') setAiPreferredBlockType('Auto'); }}
                        helpText="Let AI choose (Auto) or lock to a specific type."
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
                      {(aiPreferredType === 'Auto' || aiPreferredType === 'customerAccount.blocks') && (
                        <Select
                          label="Block target"
                          options={[
                            { label: 'Auto', value: 'Auto' },
                            { label: 'Order status', value: 'customer-account.order-status.block.render' },
                            { label: 'Order index', value: 'customer-account.order-index.block.render' },
                            { label: 'Profile', value: 'customer-account.profile.block.render' },
                            { label: 'Custom page', value: 'customer-account.page.render' },
                          ]}
                          value={aiPreferredBlockType}
                          onChange={setAiPreferredBlockType}
                          helpText="Only for customer account blocks."
                        />
                      )}
                    </InlineGrid>
                    <InlineStack gap="200">
                      <Button variant="primary" loading={isGenerating} disabled={!prompt.trim() || isGenerating} onClick={handleGenerate}>
                        {aiOptions ? 'Regenerate options' : 'Generate 3 options'}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}

                {/* Generating banner */}
                {isGenerating && (
                  <AIGeneratingAnimation label="This takes 15–40 seconds" />
                )}

                {proposeFetcher.data?.error && !isGenerating && (
                  <Banner
                    tone={proposeFetcher.data.error === 'RATE_LIMITED' ? 'warning' : 'critical'}
                    title={proposeFetcher.data.error === 'RATE_LIMITED' ? 'AI is busy right now' : 'Generation failed'}
                    action={proposeFetcher.data.error === 'RATE_LIMITED' ? { content: 'Try again', onAction: handleGenerate } : undefined}
                  >
                    <Text as="p">
                      {proposeFetcher.data.message ?? proposeFetcher.data.error}
                    </Text>
                  </Banner>
                )}
                {confirmFetcher.data?.error && !isConfirming && (
                  <Banner tone="critical">
                    <Text as="p">{confirmFetcher.data.error}</Text>
                  </Banner>
                )}
              </BlockStack>
            </Card>

            {/* Skeleton loading cards — replaced by animated loader above */}

            {/* ─── AI Options Cards ─── */}
            {!isGenerating && aiOptions && aiOptions.length > 0 && (
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">Choose an option</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {aiOptions.length} option{aiOptions.length !== 1 ? 's' : ''} generated — each has different settings and styling.
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button size="slim" loading={isGenerating} disabled={!prompt.trim() || isGenerating} onClick={handleGenerate}>
                      Regenerate
                    </Button>
                    <Button size="slim" onClick={handleStartFresh}>Start fresh</Button>
                  </InlineStack>
                </InlineStack>
                <InlineGrid columns={{ xs: 1, md: aiOptions.length >= 3 ? 3 : aiOptions.length }} gap="400">
                  {aiOptions.map((opt, i) => {
                    const r = opt.recipe as Record<string, unknown>;
                    const config = r.config as Record<string, unknown> | undefined;
                    const hasStyle = !!r.style;
                    return (
                      <div key={i}>
                        <Card>
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
                                    <Text as="p" variant="bodySm" tone="subdued">+{Object.keys(config).length - 6} more…</Text>
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
                      </div>
                    );
                  })}
                </InlineGrid>
              </BlockStack>
            )}
          </BlockStack>
        )}

        {/* Template browser */}
        {createMode === 'template' && (
          <BlockStack gap="500">
            <Card padding="500">
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg" fontWeight="semibold">Module templates</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Pick a pre-built template to get started. You can customize everything after creation.
                </Text>
              </BlockStack>
            </Card>

            <InlineGrid columns={{ xs: 1, sm: 5 }} gap="300">
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
              <Select
                label="Quality"
                labelHidden
                options={qualityOptions}
                value={tplQuality}
                onChange={(v) => setTplQuality(v as TemplateQualityFilter)}
              />
            </InlineGrid>

            <Text as="p" variant="bodySm" tone="subdued">
              {`${filteredTemplates.length} template${filteredTemplates.length !== 1 ? 's' : ''}`}
            </Text>

            {filteredTemplates.length > 0 ? (
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                {filteredTemplates.map(t => (
                  <div
                    key={t.id}
                    style={{ display: 'block', height: '100%' }}
                  >
                    <Card padding="400">
                      <div className="Modules-templateCard">
                      <BlockStack gap="300" {...{ className: 'Modules-templateCardBody' } as any}>
                        <Link
                          to={`/internal/templates/${encodeURIComponent(t.id)}`}
                          style={{ display: 'block', textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                        >
                          <BlockStack gap="300">
                            <Text as="h3" variant="headingSm">{t.name}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{t.description}</Text>
                            <InlineStack gap="200" wrap>
                              <Badge>{getCategoryDisplayLabel(t.category)}</Badge>
                              <Badge tone={getTypeTone(t.type)}>{getTypeDisplayLabel(t.type)}</Badge>
                              {t.hasAdvancedSettings && <Badge tone="success">Advanced</Badge>}
                              {t.dataSaveReady && <Badge tone="attention">Data-save</Badge>}
                              {!t.installable && <Badge tone="critical">Needs fixes</Badge>}
                            </InlineStack>
                            {t.dbModels.length > 0 && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                DB: {t.dbModels.join(', ')}
                              </Text>
                            )}
                            {!t.installable && t.installReasons.length > 0 && (
                              <Text as="p" variant="bodySm" tone="critical">
                                {t.installReasons[0]}
                              </Text>
                            )}
                            {t.tags.length > 0 && (
                              <InlineStack gap="200" wrap>
                                {t.tags.slice(0, 4).map((tag: string) => (
                                  <Text key={tag} as="span" variant="bodySm" tone="subdued">#{tag}</Text>
                                ))}
                              </InlineStack>
                            )}
                          </BlockStack>
                        </Link>
                        <div
                          className="Modules-templateAction"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <InlineStack gap="200" wrap>
                            <Button
                              size="slim"
                              variant="secondary"
                              onClick={() => navigate(`/internal/templates/${encodeURIComponent(t.id)}`)}
                            >
                              Open template
                            </Button>
                            <Form method="post" action="/api/modules/from-template">
                              <input type="hidden" name="templateId" value={t.id} />
                              <Button
                                submit
                                size="slim"
                                variant="primary"
                                loading={isSubmitting}
                                disabled={!t.installable || isSubmitting}
                              >
                                Use template
                              </Button>
                            </Form>
                          </InlineStack>
                          {!t.installable && (
                            <Text as="p" variant="bodySm" tone="critical">
                              Temporarily blocked: fix readiness in template definitions.
                            </Text>
                          )}
                        </div>
                      </BlockStack>
                      </div>
                    </Card>
                  </div>
                ))}
              </InlineGrid>
            ) : (
              <Card padding="400">
                <EmptyState heading="No templates match your filters" image="">
                  <Text as="p" tone="subdued">Try a different search term, category, or type filter.</Text>
                </EmptyState>
              </Card>
            )}
          </BlockStack>
        )}

        {/* Stats row */}
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd" fontWeight="semibold">Your modules</Text>
          <InlineGrid columns={{ xs: 3, sm: 3 }} gap="400">
            <Card padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Total</Text>
                <Text as="p" variant="headingXl">{stats.total}</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Published</Text>
                <Text as="p" variant="headingXl" tone="success">{stats.published}</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Drafts</Text>
                <Text as="p" variant="headingXl">{stats.drafts}</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </BlockStack>

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

        {/* Modules table */}
        <Card padding="0">
          <BlockStack gap="0">
            <Box padding="400">
              <div className="Modules-tableHeader">
                <Text as="h2" variant="headingMd">
                  Module list
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {filteredModules.length} shown
                </Text>
              </div>
              <Box paddingBlockStart="200">
                <Tabs tabs={tabs} selected={filterTab} onSelect={setFilterTab} />
              </Box>
            </Box>
            <Box paddingBlockStart="0" paddingInlineStart="400" paddingInlineEnd="400" paddingBlockEnd="400">
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : filteredModules.length === 0 ? (
              <EmptyState
                heading={filterTab === 0 ? 'No modules yet' : 'No modules in this category'}
                image=""
                action={{ content: 'Create a module', url: '/modules' }}
              >
                <BlockStack gap="200">
                  <Text as="p" tone="subdued">
                    {filterTab === 0
                      ? 'Create your first module with AI or from a template above.'
                      : 'Try a different filter or create a new module.'}
                  </Text>
                </BlockStack>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text', 'text', 'text']}
                headings={['Name', 'Type', 'Category', 'Status', 'Version', 'Updated', 'ID', '']}
                rows={filteredModules.map(m => [
                  <div className="Modules-rowName" title={m.name}>{m.name}</div>,
                  <Badge key={`t-${m.id}`} tone={getTypeTone(m.type)}>{getTypeDisplayLabel(m.type)}</Badge>,
                  getCategoryDisplayLabel(m.category),
                  <Badge key={`s-${m.id}`} tone={m.status === 'PUBLISHED' ? 'success' : 'attention'}>
                    {m.status}
                  </Badge>,
                  m.latestVersion,
                  <span className="Modules-rowUpdated">{new Date(m.updatedAt).toLocaleDateString('en-US')}</span>,
                  <CopyIdButton key={`copy-${m.id}`} id={m.id} />,
                  <div className="Modules-rowAction">
                    <Link key={m.id} to={`/modules/${m.id}`}>
                      <Button size="slim" variant="plain">View</Button>
                    </Link>
                  </div>,
                ])}
              />
            )}
            </Box>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

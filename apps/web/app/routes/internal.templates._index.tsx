import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Card, BlockStack, Text, InlineStack, Button, InlineGrid, TextField, Select, Badge, DataTable } from '@shopify/polaris';
import { useEffect, useMemo, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  MODULE_TEMPLATES,
  getTemplateReadiness,
  getTemplateInstallability,
} from '@superapp/core';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const workflowCount = await prisma.workflowDef.count();

  return json({
    moduleTemplates: MODULE_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      type: t.type,
      tags: t.tags ?? [],
      readiness: getTemplateReadiness(t),
      installability: getTemplateInstallability(t),
    })),
    workflowCount,
  });
}

export default function InternalTemplates() {
  const { moduleTemplates, workflowCount } = useLoaderData<typeof loader>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [type, setType] = useState('All');
  const [quality, setQuality] = useState('All');
  const [blockedSort, setBlockedSort] = useState<'id' | 'type' | 'reason'>('reason');
  const [visibleCount, setVisibleCount] = useState(24);

  const categoryOptions = useMemo(
    () => ['All', ...Array.from(new Set(moduleTemplates.map((t) => t.category))).sort((a, b) => a.localeCompare(b))],
    [moduleTemplates],
  );
  const typeOptions = useMemo(
    () => ['All', ...Array.from(new Set(moduleTemplates.map((t) => t.type))).sort((a, b) => a.localeCompare(b))],
    [moduleTemplates],
  );

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return moduleTemplates.filter((t) => {
      const matchesSearch = !q
        || t.id.toLowerCase().includes(q)
        || t.name.toLowerCase().includes(q)
        || t.description.toLowerCase().includes(q)
        || t.tags.some((tag) => tag.toLowerCase().includes(q));
      const matchesCategory = category === 'All' || t.category.toLowerCase() === category.toLowerCase();
      const matchesType = type === 'All' || t.type.toLowerCase() === type.toLowerCase();
      const matchesQuality =
        quality === 'All'
        || (quality === 'Advanced ready' && t.readiness.hasAdvancedSettings)
        || (quality === 'Data-save ready' && t.readiness.dataSaveReady)
        || (quality === 'DB-backed' && t.readiness.dbModels.length > 0);
      return matchesSearch && matchesCategory && matchesType && matchesQuality;
    });
  }, [moduleTemplates, search, category, type, quality]);

  const hasActiveFilters = search.trim() !== '' || category !== 'All' || type !== 'All' || quality !== 'All';

  useEffect(() => {
    setVisibleCount(24);
  }, [search, category, type, quality]);

  const qualityStats = useMemo(() => {
    const total = moduleTemplates.length;
    const advanced = moduleTemplates.filter((t) => t.readiness.hasAdvancedSettings).length;
    const dataSave = moduleTemplates.filter((t) => t.readiness.dataSaveReady).length;
    const dbBacked = moduleTemplates.filter((t) => t.readiness.dbModels.length > 0).length;
    return { total, advanced, dataSave, dbBacked };
  }, [moduleTemplates]);

  const blockedTemplates = useMemo(() => {
    const blocked = moduleTemplates.filter((t) => !t.installability.ok);
    const getFirstReason = (t: typeof blocked[number]) => t.installability.reasons[0] ?? 'Unknown reason';
    return [...blocked].sort((a, b) => {
      if (blockedSort === 'id') return a.id.localeCompare(b.id);
      if (blockedSort === 'type') return a.type.localeCompare(b.type);
      return getFirstReason(a).localeCompare(getFirstReason(b));
    });
  }, [moduleTemplates, blockedSort]);

  const blockedReasonCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of blockedTemplates) {
      for (const reason of t.installability.reasons) {
        map.set(reason, (map.get(reason) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [blockedTemplates]);

  const installableCount = moduleTemplates.length - blockedTemplates.length;
  const installabilityPct = moduleTemplates.length > 0
    ? Math.round((installableCount / moduleTemplates.length) * 100)
    : 0;
  const canLoadMore = visibleCount < filteredTemplates.length;
  const visibleTemplates = filteredTemplates.slice(0, visibleCount);

  const exportBlockedTemplates = () => {
    const payload = blockedTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      category: t.category,
      reasons: t.installability.reasons,
      readiness: {
        hasAdvancedSettings: t.readiness.hasAdvancedSettings,
        dataSaveReady: t.readiness.dataSaveReady,
        storageMode: t.readiness.storageMode,
        dbModels: t.readiness.dbModels,
      },
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'template-health-blocked.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  };

  return (
    <Page title="Templates" subtitle="Manage module and flow templates shown to merchants.">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Module templates</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Default recipe templates for AI modules. Open a template card to edit settings, preview merchant rendering, and create sandbox drafts.
            </Text>
            <InlineStack gap="200" wrap>
              <Badge>{`${qualityStats.total} total`}</Badge>
              <Badge tone="success">{`${qualityStats.advanced} advanced-ready`}</Badge>
              <Badge tone="attention">{`${qualityStats.dataSave} data-save-ready`}</Badge>
              <Badge tone="info">{`${qualityStats.dbBacked} DB-backed`}</Badge>
              <Badge tone={blockedTemplates.length === 0 ? 'success' : 'attention'}>
                {`${installabilityPct}% installable`}
              </Badge>
            </InlineStack>

            <InlineGrid columns={{ xs: 1, sm: 4 }} gap="300">
              <TextField
                label="Search"
                labelHidden
                value={search}
                onChange={setSearch}
                placeholder="Search by ID, name, tags…"
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setSearch('')}
              />
              <Select
                label="Category"
                labelHidden
                value={category}
                onChange={setCategory}
                options={[
                  { label: 'All categories', value: 'All' },
                  ...categoryOptions.filter((c) => c !== 'All').map((c) => ({ label: c, value: c })),
                ]}
              />
              <Select
                label="Type"
                labelHidden
                value={type}
                onChange={setType}
                options={[
                  { label: 'All types', value: 'All' },
                  ...typeOptions.filter((t) => t !== 'All').map((t) => ({ label: t, value: t })),
                ]}
              />
              <Select
                label="Quality"
                labelHidden
                value={quality}
                onChange={setQuality}
                options={[
                  { label: 'All quality levels', value: 'All' },
                  { label: 'Advanced ready', value: 'Advanced ready' },
                  { label: 'Data-save ready', value: 'Data-save ready' },
                  { label: 'DB-backed', value: 'DB-backed' },
                ]}
              />
            </InlineGrid>

            <Text as="p" variant="bodySm" tone="subdued">
              Showing {Math.min(visibleCount, filteredTemplates.length)} of {filteredTemplates.length} filtered templates ({moduleTemplates.length} total).
            </Text>

            {visibleTemplates.length === 0 ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="headingSm">No templates match this filter set.</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Try removing one or more filters to widen results.
                  </Text>
                  {hasActiveFilters ? (
                    <InlineStack>
                      <Button
                        onClick={() => {
                          setSearch('');
                          setCategory('All');
                          setType('All');
                          setQuality('All');
                        }}
                      >
                        Clear filters
                      </Button>
                    </InlineStack>
                  ) : null}
                </BlockStack>
              </Card>
            ) : (
              <BlockStack gap="300">
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
                  {visibleTemplates.map(t => (
                    <Card key={t.id}>
                      <a
                        href={`/internal/templates/${encodeURIComponent(t.id)}`}
                        style={{ display: 'block', cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
                      >
                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="p" variant="headingSm">{t.name}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{t.id}</Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">{t.type} · {t.category}</Text>
                          <InlineStack gap="200" wrap>
                            {t.readiness.hasAdvancedSettings && <Badge tone="success">Advanced</Badge>}
                            {t.readiness.dataSaveReady && <Badge tone="attention">Data-save</Badge>}
                            {t.readiness.dbModels.length > 0 && <Badge tone="info">DB-backed</Badge>}
                            {t.installability.ok ? <Badge tone="success">Installable</Badge> : <Badge tone="critical">Blocked</Badge>}
                          </InlineStack>
                          {t.readiness.dbModels.length > 0 && (
                            <Text as="p" variant="bodySm" tone="subdued">DB: {t.readiness.dbModels.join(', ')}</Text>
                          )}
                          {!t.installability.ok && t.installability.reasons[0] && (
                            <Text as="p" variant="bodySm" tone="critical">{t.installability.reasons[0]}</Text>
                          )}
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="p" variant="bodySm" tone="subdued">Open sandbox preview</Text>
                            <Badge tone="info">Open</Badge>
                          </InlineStack>
                        </BlockStack>
                      </a>
                    </Card>
                  ))}
                </InlineGrid>

                <InlineStack align="space-between" blockAlign="center">
                  {hasActiveFilters ? (
                    <Button
                      onClick={() => {
                        setSearch('');
                        setCategory('All');
                        setType('All');
                        setQuality('All');
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : <span />}
                  {canLoadMore ? (
                    <Button onClick={() => setVisibleCount((current) => Math.min(current + 24, filteredTemplates.length))}>
                      Load 24 more
                    </Button>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">All filtered templates shown.</Text>
                  )}
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Template health rollout</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Templates blocked by installability policy. Fix these before enabling broad rollout.
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Select
                  label="Sort blocked"
                  labelHidden
                  value={blockedSort}
                  onChange={(v) => setBlockedSort(v as 'id' | 'type' | 'reason')}
                  options={[
                    { label: 'Sort by reason', value: 'reason' },
                    { label: 'Sort by type', value: 'type' },
                    { label: 'Sort by id', value: 'id' },
                  ]}
                />
                <Button onClick={exportBlockedTemplates} disabled={blockedTemplates.length === 0}>
                  Export blocked JSON
                </Button>
              </InlineStack>
            </InlineStack>

            <InlineStack gap="200" wrap>
              <Badge tone={blockedTemplates.length === 0 ? 'success' : 'critical'}>
                {`${blockedTemplates.length} blocked`}
              </Badge>
              <Badge tone="info">{`${blockedReasonCounts.length} distinct reasons`}</Badge>
            </InlineStack>

            {blockedReasonCounts.length > 0 && (
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" fontWeight="medium">Top blockers</Text>
                {blockedReasonCounts.slice(0, 6).map(([reason, count]) => (
                  <Text key={reason} as="p" variant="bodySm" tone="subdued">
                    {count}x — {reason}
                  </Text>
                ))}
              </BlockStack>
            )}

            {blockedTemplates.length === 0 ? (
              <Text as="p" variant="bodySm" tone="success">No blocked templates. Installability gates are fully green.</Text>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text']}
                headings={['Template', 'Type', 'Storage', 'Primary block reason']}
                rows={blockedTemplates.map((t) => [
                  `${t.id} — ${t.name}`,
                  t.type,
                  `${t.readiness.storageMode}${t.readiness.dbModels.length ? ` (${t.readiness.dbModels.join(', ')})` : ''}`,
                  t.installability.reasons[0] ?? 'Unknown',
                ])}
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Flow templates</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Workflow and flow templates. Edit via the flow builder (JSON or interactive). Store-defined workflows: {workflowCount}.
            </Text>
            <InlineStack gap="200">
              <Button url="/flows" variant="secondary">Flow builder (merchant)</Button>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Interactive flow creator and flow template editor can be added here to manage default flow templates from the admin dashboard.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

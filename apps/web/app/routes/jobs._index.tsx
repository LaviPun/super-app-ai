import { json } from '@remix-run/node';
import { useLoaderData, useNavigation, useSearchParams } from '@remix-run/react';
import {
  Badge,
  BlockStack,
  Button,
  Card,
  DataTable,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
} from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

type ParsedPayload = Record<string, unknown> | null;

function safeParseJson(value: string | null): ParsedPayload {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const JOB_STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Queued', value: 'QUEUED' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Success', value: 'SUCCESS' },
  { label: 'Failed', value: 'FAILED' },
];

const JOB_TYPE_LABEL: Record<string, string> = {
  AI_GENERATE: 'Generation',
  AI_HYDRATE: 'Hydration',
  AI_MODIFY: 'Modify',
  PUBLISH: 'Publish',
  CONNECTOR_TEST: 'Connector test',
  FLOW_RUN: 'Flow run',
  THEME_ANALYZE: 'Theme analyze',
};

function getStatusTone(status: string): 'success' | 'critical' | 'attention' | 'info' {
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILED') return 'critical';
  if (status === 'RUNNING') return 'info';
  return 'attention';
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function durationSeconds(startedAt: string | null, finishedAt: string | null, createdAt: string): string {
  const startMs = startedAt ? new Date(startedAt).getTime() : new Date(createdAt).getTime();
  const endMs = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const sec = Math.max(0, (endMs - startMs) / 1000);
  return `${sec.toFixed(1)}s`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(4)}`;
}

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || undefined;
  const type = url.searchParams.get('type') || undefined;
  const q = url.searchParams.get('q') || undefined;

  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
    });
  }

  const where = {
    shopId: shopRow.id,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(q
      ? {
          OR: [
            { type: { contains: q } },
            { error: { contains: q } },
            { payload: { contains: q } },
            { result: { contains: q } },
            { correlationId: { contains: q } },
          ],
        }
      : {}),
  };

  const [jobs, activity] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 250,
    }),
    prisma.activityLog.findMany({
      where: {
        shopId: shopRow.id,
        action: {
          in: [
            'MODULE_SPEC_EDITED',
            'REQUEST_SUCCESS',
            'REQUEST_ERROR',
            'MODULE_PUBLISHED',
            'MODULE_MODIFIED_WITH_AI',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  const moduleIds = new Set<string>();
  const correlations = new Set<string>();
  const parsedById = new Map<string, ParsedPayload>();
  for (const job of jobs) {
    const parsed = safeParseJson(job.payload);
    parsedById.set(job.id, parsed);
    const moduleId = asString(parsed?.moduleId);
    if (moduleId) moduleIds.add(moduleId);
    if (job.correlationId) correlations.add(job.correlationId);
  }

  const modules = moduleIds.size
    ? await prisma.module.findMany({
        where: { id: { in: Array.from(moduleIds) }, shopId: shopRow.id },
        select: { id: true, name: true, type: true, status: true },
      })
    : [];
  const moduleById = new Map(modules.map((m) => [m.id, m]));

  const aiUsageRows = correlations.size
    ? await prisma.aiUsage.findMany({
        where: { shopId: shopRow.id, correlationId: { in: Array.from(correlations) } },
        include: { provider: true },
      })
    : [];
  const aiUsageByCorrelation = new Map<
    string,
    { tokensIn: number; tokensOut: number; costCents: number; providers: string[]; models: string[]; requests: number }
  >();
  for (const row of aiUsageRows) {
    const corr = row.correlationId;
    if (!corr) continue;
    const current = aiUsageByCorrelation.get(corr) ?? {
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
      providers: [],
      models: [],
      requests: 0,
    };
    current.tokensIn += row.tokensIn;
    current.tokensOut += row.tokensOut;
    current.costCents += row.costCents;
    current.requests += row.requestCount;
    if (row.provider?.name && !current.providers.includes(row.provider.name)) current.providers.push(row.provider.name);
    if (row.provider?.model && !current.models.includes(row.provider.model)) current.models.push(row.provider.model);
    aiUsageByCorrelation.set(corr, current);
  }

  const since30d = new Date(Date.now() - 30 * 86400000);
  const aiStoreRows = await prisma.aiUsage.findMany({
    where: { shopId: shopRow.id },
    include: { provider: true },
  });
  const aiStoreRows30d = aiStoreRows.filter((r) => r.createdAt >= since30d);
  const summarizeAiRows = (rows: typeof aiStoreRows) => {
    const byProvider = new Map<string, { provider: string; model: string; requests: number; tokensIn: number; tokensOut: number; costCents: number }>();
    let totalRequests = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCostCents = 0;
    for (const row of rows) {
      totalRequests += row.requestCount;
      totalTokensIn += row.tokensIn;
      totalTokensOut += row.tokensOut;
      totalCostCents += row.costCents;
      const providerName = row.provider?.name ?? row.provider?.provider ?? 'Unknown provider';
      const model = row.provider?.model ?? '—';
      const key = `${providerName}::${model}`;
      const cur = byProvider.get(key) ?? {
        provider: providerName,
        model,
        requests: 0,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
      };
      cur.requests += row.requestCount;
      cur.tokensIn += row.tokensIn;
      cur.tokensOut += row.tokensOut;
      cur.costCents += row.costCents;
      byProvider.set(key, cur);
    }
    return {
      totalRequests,
      totalTokensIn,
      totalTokensOut,
      totalCostCents,
      byProvider: Array.from(byProvider.values()).sort((a, b) => b.costCents - a.costCents),
    };
  };

  const distinctTypes = [...new Set(jobs.map((j) => j.type))].sort();
  const running = jobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED').length;
  const failed = jobs.filter((j) => j.status === 'FAILED').length;
  const success = jobs.filter((j) => j.status === 'SUCCESS').length;

  const jobsData = jobs.map((job) => {
    const payload = parsedById.get(job.id);
    const moduleId = asString(payload?.moduleId);
    const module = moduleId ? moduleById.get(moduleId) ?? null : null;
    const target = payload?.target && typeof payload.target === 'object' ? (payload.target as Record<string, unknown>) : null;
    const triggerSource = asString(payload?.source) ?? 'system';
    const themeId = asString(target?.themeId);
    const targetKind = asString(target?.kind);
    return {
      id: job.id,
      type: job.type,
      typeLabel: JOB_TYPE_LABEL[job.type] ?? job.type,
      status: job.status,
      attempts: job.attempts,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      correlationId: job.correlationId ?? null,
      requestId: job.requestId ?? null,
      moduleId,
      moduleName: module?.name ?? null,
      moduleType: module?.type ?? null,
      moduleStatus: module?.status ?? null,
      targetKind,
      themeId,
      triggerSource,
      payloadText: job.payload,
      resultText: job.result,
      aiUsage: job.correlationId ? aiUsageByCorrelation.get(job.correlationId) ?? null : null,
    };
  });

  const eventsData = activity.map((row) => {
    const details = safeParseJson(row.details);
    return {
      id: row.id,
      action: row.action,
      actor: row.actor,
      resource: row.resource,
      createdAt: row.createdAt.toISOString(),
      outcome: row.action === 'REQUEST_ERROR' ? 'FAILED' : row.action === 'REQUEST_SUCCESS' ? 'SUCCESS' : 'INFO',
      detailsText: row.details,
      moduleId: row.resource?.startsWith('module:') ? row.resource.slice('module:'.length) : null,
      path: asString(details?.path) ?? asString(details?.pathOrIntent),
    };
  });

  return json({
    shopDomain: session.shop,
    stats: { total: jobsData.length, running, failed, success },
    filters: { status: status ?? '', type: type ?? '', q: q ?? '' },
    distinctTypes,
    jobs: jobsData,
    events: eventsData,
    aiSummary30d: summarizeAiRows(aiStoreRows30d),
    aiSummaryAllTime: summarizeAiRows(aiStoreRows),
  });
}

export default function JobsPage() {
  const { shopDomain, stats, filters, distinctTypes, jobs, events, aiSummary30d, aiSummaryAllTime } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const storeSlug = shopDomain.replace('.myshopify.com', '');
  const storeAdminUrl = `https://admin.shopify.com/store/${encodeURIComponent(storeSlug)}`;

  const typeOptions = [{ label: 'All types', value: '' }, ...distinctTypes.map((t) => ({ label: JOB_TYPE_LABEL[t] ?? t, value: t }))];

  return (
    <Page title="Jobs" subtitle="Detailed queue, execution status, trigger source, and module traceability" backAction={{ content: 'Home', url: '/' }}>
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
          <Card><Text as="p" variant="headingMd">Total: {stats.total}</Text></Card>
          <Card><Text as="p" variant="headingMd">Running: {stats.running}</Text></Card>
          <Card><Text as="p" variant="headingMd">Success: {stats.success}</Text></Card>
          <Card><Text as="p" variant="headingMd">Failed: {stats.failed}</Text></Card>
        </InlineGrid>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Store AI usage and cost</Text>
            <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
              <Card><Text as="p" variant="bodySm">30d requests: {aiSummary30d.totalRequests}</Text></Card>
              <Card><Text as="p" variant="bodySm">30d tokens in/out: {aiSummary30d.totalTokensIn} / {aiSummary30d.totalTokensOut}</Text></Card>
              <Card><Text as="p" variant="bodySm">30d cost: {formatCents(aiSummary30d.totalCostCents)}</Text></Card>
              <Card><Text as="p" variant="bodySm">All-time cost: {formatCents(aiSummaryAllTime.totalCostCents)}</Text></Card>
            </InlineGrid>
            {aiSummaryAllTime.byProvider.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'text']}
                headings={['Provider', 'Model', 'Requests', 'Tokens in', 'Tokens out', 'Cost']}
                rows={aiSummaryAllTime.byProvider.map((row) => [
                  row.provider,
                  row.model,
                  row.requests,
                  row.tokensIn,
                  row.tokensOut,
                  formatCents(row.costCents),
                ])}
              />
            ) : (
              <Text as="p" tone="subdued">No AI usage recorded for this store yet.</Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <InlineStack gap="300" wrap blockAlign="end">
              <div style={{ minWidth: 170 }}>
                <Select
                  label="Status"
                  options={JOB_STATUS_OPTIONS}
                  value={filters.status}
                  onChange={(v) => {
                    const p = new URLSearchParams(params);
                    if (v) p.set('status', v); else p.delete('status');
                    setParams(p);
                  }}
                />
              </div>
              <div style={{ minWidth: 190 }}>
                <Select
                  label="Type"
                  options={typeOptions}
                  value={filters.type}
                  onChange={(v) => {
                    const p = new URLSearchParams(params);
                    if (v) p.set('type', v); else p.delete('type');
                    setParams(p);
                  }}
                />
              </div>
              <div style={{ minWidth: 260 }}>
                <TextField
                  label="Search"
                  value={filters.q}
                  autoComplete="off"
                  placeholder="module id, correlation id, error..."
                  onChange={(v) => {
                    const p = new URLSearchParams(params);
                    if (v) p.set('q', v); else p.delete('q');
                    setParams(p);
                  }}
                />
              </div>
              <Button url="/jobs" variant="secondary">Clear</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Execution jobs</Text>
              <Button url={storeAdminUrl} external variant="plain">Open store admin</Button>
            </InlineStack>
            {isLoading ? (
              <SkeletonBodyText lines={8} />
            ) : jobs.length === 0 ? (
              <Text as="p" tone="subdued">No jobs for current filters.</Text>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Time', 'Type', 'Status', 'Trigger', 'Module', 'Target', 'AI usage', 'Duration', 'Correlation', 'Actions']}
                rows={jobs.map((j) => [
                  new Date(j.createdAt).toLocaleString(),
                  j.typeLabel,
                  <Badge key={`s-${j.id}`} tone={getStatusTone(j.status)}>{j.status}</Badge>,
                  j.triggerSource,
                  j.moduleId ? (
                    <InlineStack key={`m-${j.id}`} gap="100" wrap>
                      <Button url={`/modules/${encodeURIComponent(j.moduleId)}`} size="slim" variant="plain">
                        {j.moduleName ?? j.moduleId.slice(0, 8)}
                      </Button>
                      {j.moduleStatus ? <Badge>{j.moduleStatus}</Badge> : null}
                    </InlineStack>
                  ) : '—',
                  j.targetKind ? `${j.targetKind}${j.themeId ? ` · theme ${j.themeId}` : ''}` : '—',
                  j.aiUsage ? (
                    <InlineStack key={`ai-${j.id}`} gap="100" wrap>
                      <Text as="span" variant="bodySm">{formatCents(j.aiUsage.costCents)}</Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {j.aiUsage.tokensIn}/{j.aiUsage.tokensOut} tokens
                      </Text>
                      {j.aiUsage.providers.length > 0 ? <Badge>{j.aiUsage.providers[0]}</Badge> : null}
                    </InlineStack>
                  ) : (
                    <Text as="span" variant="bodySm" tone="subdued">No AI usage</Text>
                  ),
                  durationSeconds(j.startedAt, j.finishedAt, j.createdAt),
                  j.correlationId ? (
                    <code key={`c-${j.id}`} style={{ fontSize: 11 }}>{j.correlationId.slice(0, 18)}…</code>
                  ) : '—',
                  <InlineStack key={`a-${j.id}`} gap="100">
                    {j.correlationId ? (
                      <Button size="slim" variant="plain" url={`/internal/trace/${encodeURIComponent(j.correlationId)}`}>Trace</Button>
                    ) : null}
                    {j.error ? (
                      <Text as="span" variant="bodySm" tone="critical" truncate>
                        {j.error.slice(0, 60)}
                      </Text>
                    ) : (
                      <Text as="span" variant="bodySm" tone="subdued">No error</Text>
                    )}
                  </InlineStack>,
                ])}
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Operational events (save / status / publish / generation)</Text>
            {events.length === 0 ? (
              <Text as="p" tone="subdued">No operational activity yet.</Text>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Time', 'Action', 'Outcome', 'Module', 'Path', 'Actor']}
                rows={events.map((e) => [
                  new Date(e.createdAt).toLocaleString(),
                  e.action,
                  <Badge key={`o-${e.id}`} tone={e.outcome === 'FAILED' ? 'critical' : e.outcome === 'SUCCESS' ? 'success' : 'info'}>{e.outcome}</Badge>,
                  e.moduleId ? <Button key={`evm-${e.id}`} size="slim" variant="plain" url={`/modules/${encodeURIComponent(e.moduleId)}`}>{e.moduleId.slice(0, 8)}…</Button> : '—',
                  e.path ?? '—',
                  e.actor,
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

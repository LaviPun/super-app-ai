import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useNavigation, useSearchParams } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { EmptyState, MonoChip, StatTile, StatusBadge, fmtNum } from '~/components/merchant/polaris';

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

  // Bounded AI-usage aggregation: groupBy in the DB instead of loading every row.
  const since30d = new Date(Date.now() - 30 * 86400000);
  const [aiGrouped30d, aiGroupedAllTime] = await Promise.all([
    prisma.aiUsage.groupBy({
      by: ['providerId'],
      where: { shopId: shopRow.id, createdAt: { gte: since30d } },
      _sum: { requestCount: true, tokensIn: true, tokensOut: true, costCents: true },
    }),
    prisma.aiUsage.groupBy({
      by: ['providerId'],
      where: { shopId: shopRow.id },
      _sum: { requestCount: true, tokensIn: true, tokensOut: true, costCents: true },
    }),
  ]);
  const providerIds = [...new Set([...aiGrouped30d, ...aiGroupedAllTime].map((g) => g.providerId))];
  const providers = providerIds.length
    ? await prisma.aiProvider.findMany({
        where: { id: { in: providerIds } },
        select: { id: true, name: true, provider: true, model: true },
      })
    : [];
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const summarizeAiGroups = (groups: typeof aiGrouped30d) => {
    let totalRequests = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCostCents = 0;
    const byProvider = groups.map((g) => {
      const p = providerById.get(g.providerId);
      const requests = g._sum.requestCount ?? 0;
      const tokensIn = g._sum.tokensIn ?? 0;
      const tokensOut = g._sum.tokensOut ?? 0;
      const costCents = g._sum.costCents ?? 0;
      totalRequests += requests;
      totalTokensIn += tokensIn;
      totalTokensOut += tokensOut;
      totalCostCents += costCents;
      return {
        provider: p?.name ?? p?.provider ?? 'Unknown provider',
        model: p?.model ?? '—',
        requests,
        tokensIn,
        tokensOut,
        costCents,
      };
    });
    return {
      totalRequests,
      totalTokensIn,
      totalTokensOut,
      totalCostCents,
      byProvider: byProvider.sort((a, b) => b.costCents - a.costCents),
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
    aiSummary30d: summarizeAiGroups(aiGrouped30d),
    aiSummaryAllTime: summarizeAiGroups(aiGroupedAllTime),
  });
}

export default function JobsPage() {
  return (
    <MerchantShell polaris>
      <JobsBody />
    </MerchantShell>
  );
}

function JobsBody() {
  const { shopDomain, stats, filters, distinctTypes, jobs, events, aiSummary30d, aiSummaryAllTime } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const storeSlug = shopDomain.replace('.myshopify.com', '');
  const storeAdminUrl = `https://admin.shopify.com/store/${encodeURIComponent(storeSlug)}`;

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value); else p.delete(key);
    setParams(p);
  };

  return (
    <s-page heading="Jobs" inlineSize="large">
      <s-stack gap="small-100">
        <s-stack direction="inline">
          <s-button variant="tertiary" icon="arrow-left" onClick={() => navigate('/')}>Home</s-button>
        </s-stack>
        <s-paragraph color="subdued">
          Detailed queue, execution status, trigger source, and module traceability.
        </s-paragraph>
      </s-stack>

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
        <StatTile label="Total jobs" value={fmtNum(stats.total)} />
        <StatTile label="Running" value={fmtNum(stats.running)} />
        <StatTile label="Success" value={fmtNum(stats.success)} />
        <StatTile label="Failed" value={fmtNum(stats.failed)} />
      </s-grid>

      <s-section heading="Store AI usage and cost">
        <s-stack gap="base">
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
            <StatTile label="Requests (30d)" value={fmtNum(aiSummary30d.totalRequests)} />
            <StatTile label="Tokens in / out (30d)" value={`${fmtNum(aiSummary30d.totalTokensIn)} / ${fmtNum(aiSummary30d.totalTokensOut)}`} />
            <StatTile label="Cost (30d)" value={formatCents(aiSummary30d.totalCostCents)} />
            <StatTile label="Cost (all time)" value={formatCents(aiSummaryAllTime.totalCostCents)} />
          </s-grid>
          {aiSummaryAllTime.byProvider.length > 0 ? (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Provider</s-table-header>
                <s-table-header>Model</s-table-header>
                <s-table-header>Requests</s-table-header>
                <s-table-header>Tokens in</s-table-header>
                <s-table-header>Tokens out</s-table-header>
                <s-table-header listSlot="inline">Cost</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {aiSummaryAllTime.byProvider.map((row) => (
                  <s-table-row key={`${row.provider}-${row.model}`}>
                    <s-table-cell><s-text type="strong">{row.provider}</s-text></s-table-cell>
                    <s-table-cell><MonoChip>{row.model}</MonoChip></s-table-cell>
                    <s-table-cell>{fmtNum(row.requests)}</s-table-cell>
                    <s-table-cell>{fmtNum(row.tokensIn)}</s-table-cell>
                    <s-table-cell>{fmtNum(row.tokensOut)}</s-table-cell>
                    <s-table-cell>{formatCents(row.costCents)}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          ) : (
            <s-text color="subdued">No AI usage recorded for this store yet.</s-text>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Execution jobs" padding="none">
        <s-button slot="primary-action" variant="tertiary" icon="external" href={storeAdminUrl} target="_blank">
          Open store admin
        </s-button>
        <s-table>
          <s-grid slot="filters" gridTemplateColumns="auto auto 1fr auto auto" gap="small-100" alignItems="center">
            <s-select
              label="Status"
              labelAccessibilityVisibility="exclusive"
              value={filters.status}
              onChange={(e) => setParam('status', e.currentTarget.value)}
            >
              {JOB_STATUS_OPTIONS.map((o) => (
                <s-option key={o.value} value={o.value}>{o.label}</s-option>
              ))}
            </s-select>
            <s-select
              label="Type"
              labelAccessibilityVisibility="exclusive"
              value={filters.type}
              onChange={(e) => setParam('type', e.currentTarget.value)}
            >
              <s-option value="">All types</s-option>
              {distinctTypes.map((t) => (
                <s-option key={t} value={t}>{JOB_TYPE_LABEL[t] ?? t}</s-option>
              ))}
            </s-select>
            <s-search-field
              label="Search jobs"
              labelAccessibilityVisibility="exclusive"
              placeholder="module id, correlation id, error…"
              defaultValue={filters.q}
              onChange={(e) => setParam('q', e.currentTarget.value ?? '')}
            />
            {isLoading && <s-spinner accessibilityLabel="Loading jobs" size="base" />}
            <s-button variant="tertiary" onClick={() => navigate('/jobs')}>Clear</s-button>
          </s-grid>
          <s-table-header-row>
            <s-table-header listSlot="kicker">Time</s-table-header>
            <s-table-header listSlot="primary">Type</s-table-header>
            <s-table-header listSlot="inline">Status</s-table-header>
            <s-table-header>Trigger</s-table-header>
            <s-table-header>Module</s-table-header>
            <s-table-header>Target</s-table-header>
            <s-table-header>AI usage</s-table-header>
            <s-table-header>Duration</s-table-header>
            <s-table-header>Correlation</s-table-header>
            <s-table-header>Error</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {jobs.map((j) => (
              <s-table-row key={j.id}>
                <s-table-cell><s-text color="subdued">{new Date(j.createdAt).toLocaleString()}</s-text></s-table-cell>
                <s-table-cell><s-text type="strong">{j.typeLabel}</s-text></s-table-cell>
                <s-table-cell><StatusBadge status={j.status} /></s-table-cell>
                <s-table-cell>{j.triggerSource}</s-table-cell>
                <s-table-cell>
                  {j.moduleId ? (
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      <s-link onClick={() => navigate(`/modules/${encodeURIComponent(j.moduleId!)}`)}>
                        {j.moduleName ?? j.moduleId.slice(0, 8)}
                      </s-link>
                      {j.moduleStatus ? <StatusBadge status={j.moduleStatus} /> : null}
                    </s-stack>
                  ) : (
                    <s-text color="subdued">—</s-text>
                  )}
                </s-table-cell>
                <s-table-cell>
                  {j.targetKind ? `${j.targetKind}${j.themeId ? ` · theme ${j.themeId}` : ''}` : <s-text color="subdued">—</s-text>}
                </s-table-cell>
                <s-table-cell>
                  {j.aiUsage ? (
                    <s-stack gap="none">
                      <s-text>{formatCents(j.aiUsage.costCents)}</s-text>
                      <s-text color="subdued">
                        {fmtNum(j.aiUsage.tokensIn)}/{fmtNum(j.aiUsage.tokensOut)} tok{j.aiUsage.providers.length > 0 ? ` · ${j.aiUsage.providers[0]}` : ''}
                      </s-text>
                    </s-stack>
                  ) : (
                    <s-text color="subdued">—</s-text>
                  )}
                </s-table-cell>
                <s-table-cell>{durationSeconds(j.startedAt, j.finishedAt, j.createdAt)}</s-table-cell>
                <s-table-cell>
                  {j.correlationId ? <MonoChip>{j.correlationId.slice(0, 18)}…</MonoChip> : <s-text color="subdued">—</s-text>}
                </s-table-cell>
                <s-table-cell>
                  {j.error ? (
                    <s-text tone="critical">{j.error.slice(0, 60)}</s-text>
                  ) : (
                    <s-text color="subdued">—</s-text>
                  )}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        {jobs.length === 0 && (
          <EmptyState heading="No jobs">No jobs for current filters.</EmptyState>
        )}
      </s-section>

      <s-section heading="Operational events" padding="none">
        {events.length === 0 ? (
          <EmptyState heading="No operational activity yet">
            Save, status, publish, and generation events will appear here.
          </EmptyState>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="kicker">Time</s-table-header>
              <s-table-header listSlot="primary">Action</s-table-header>
              <s-table-header listSlot="inline">Outcome</s-table-header>
              <s-table-header>Module</s-table-header>
              <s-table-header>Path</s-table-header>
              <s-table-header>Actor</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {events.map((e) => (
                <s-table-row key={e.id}>
                  <s-table-cell><s-text color="subdued">{new Date(e.createdAt).toLocaleString()}</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{e.action}</s-text></s-table-cell>
                  <s-table-cell><StatusBadge status={e.outcome} /></s-table-cell>
                  <s-table-cell>
                    {e.moduleId ? (
                      <s-link onClick={() => navigate(`/modules/${encodeURIComponent(e.moduleId!)}`)}>
                        {e.moduleId.slice(0, 8)}…
                      </s-link>
                    ) : (
                      <s-text color="subdued">—</s-text>
                    )}
                  </s-table-cell>
                  <s-table-cell>{e.path ?? <s-text color="subdued">—</s-text>}</s-table-cell>
                  <s-table-cell>{e.actor}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';

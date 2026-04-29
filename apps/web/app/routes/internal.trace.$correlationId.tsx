import { json } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { useState } from 'react';
import {
  Page, Card, BlockStack, Text, Badge, InlineStack, Tabs, EmptyState, Box, Banner,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

const NOT_FOUND = new Response(null, { status: 404 });

type TraceItem = {
  type: 'API_LOG' | 'JOB' | 'ERROR_LOG' | 'AI_USAGE' | 'FLOW_STEP' | 'ACTIVITY';
  id: string;
  createdAt: string;
  summary: string;
  detail: string | null;
  status: 'OK' | 'WARN' | 'ERROR' | 'INFO';
  shopDomain: string | null;
  href?: string;
};

type LoaderData = {
  correlationId: string;
  apiLogs: TraceItem[];
  jobs: TraceItem[];
  errorLogs: TraceItem[];
  aiUsage: TraceItem[];
  flowSteps: TraceItem[];
  activity: TraceItem[];
  timeline: TraceItem[];
  totals: { api: number; jobs: number; errors: number; ai: number; flow: number; activity: number };
  truncated: boolean;
};

export async function loader({ request, params }: { request: Request; params: { correlationId?: string } }) {
  await requireInternalAdmin(request);
  const correlationId = params.correlationId;
  if (!correlationId) throw NOT_FOUND;

  const prisma = getPrisma();

  const [apiLogs, jobs, errorLogs, aiUsage, flowSteps, activity] = await Promise.all([
    prisma.apiLog.findMany({
      where: { OR: [{ correlationId }, { requestId: correlationId }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { shop: true },
      take: 200,
    }),
    prisma.job.findMany({
      where: { OR: [{ correlationId }, { requestId: correlationId }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { shop: true },
      take: 200,
    }),
    prisma.errorLog.findMany({
      where: { OR: [{ correlationId }, { requestId: correlationId }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { shop: true },
      take: 200,
    }),
    prisma.aiUsage.findMany({
      where: { correlationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { shop: true, provider: true },
      take: 200,
    }),
    prisma.flowStepLog.findMany({
      where: { correlationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { shop: true },
      take: 200,
    }),
    prisma.activityLog.findMany({
      where: { OR: [{ correlationId }, { requestId: correlationId }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { shop: true },
      take: 200,
    }),
  ]);

  const apiItems: TraceItem[] = apiLogs.map(l => ({
    type: 'API_LOG',
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    summary: `${l.actor} ${l.method} ${l.path} → ${l.finishedAt == null ? 'running' : `HTTP ${l.status} (${l.durationMs}ms)`}`,
    detail: l.meta,
    status: l.finishedAt == null ? 'INFO' : l.success ? 'OK' : 'ERROR',
    shopDomain: l.shop?.shopDomain ?? null,
    href: `/internal/api-logs/${l.id}`,
  }));
  const jobItems: TraceItem[] = jobs.map(j => ({
    type: 'JOB',
    id: j.id,
    createdAt: j.createdAt.toISOString(),
    summary: `Job ${j.type} → ${j.status}`,
    detail: j.error ?? j.result ?? j.payload,
    status: j.status === 'FAILED' ? 'ERROR' : j.status === 'SUCCESS' ? 'OK' : 'INFO',
    shopDomain: j.shop?.shopDomain ?? null,
  }));
  const errorItems: TraceItem[] = errorLogs.map(l => ({
    type: 'ERROR_LOG',
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    summary: `${l.level} ${l.source ?? ''} ${l.message}`.trim(),
    detail: l.stack ?? l.meta,
    status: l.level === 'ERROR' ? 'ERROR' : l.level === 'WARN' ? 'WARN' : 'INFO',
    shopDomain: l.shop?.shopDomain ?? null,
    href: `/internal/logs/${l.id}`,
  }));
  const aiItems: TraceItem[] = aiUsage.map(a => ({
    type: 'AI_USAGE',
    id: a.id,
    createdAt: a.createdAt.toISOString(),
    summary: `AI ${a.action} via ${a.provider?.name ?? a.providerId} · ${a.tokensIn}+${a.tokensOut} tokens · ${a.costCents}¢`,
    detail: a.meta,
    status: 'OK',
    shopDomain: a.shop?.shopDomain ?? null,
  }));
  const flowItems: TraceItem[] = flowSteps.map(s => ({
    type: 'FLOW_STEP',
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    summary: `Flow step ${s.step} ${s.kind} → ${s.status} (${s.durationMs ?? 0}ms)`,
    detail: s.error ?? s.output,
    status: s.status === 'SUCCESS' ? 'OK' : s.status === 'FAILED' ? 'ERROR' : 'INFO',
    shopDomain: s.shop?.shopDomain ?? null,
  }));
  const activityItems: TraceItem[] = activity.map(a => ({
    type: 'ACTIVITY',
    id: a.id,
    createdAt: a.createdAt.toISOString(),
    summary: `${a.actor} ${a.action}${a.resource ? ` · ${a.resource}` : ''}`,
    detail: a.details,
    status: a.action === 'REQUEST_ERROR' ? 'ERROR' : 'INFO',
    shopDomain: a.shop?.shopDomain ?? null,
    href: `/internal/activity/${a.id}`,
  }));

  const timeline = [...apiItems, ...jobItems, ...errorItems, ...aiItems, ...flowItems, ...activityItems]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const PER_TABLE_LIMIT = 200;
  const truncated =
    apiLogs.length >= PER_TABLE_LIMIT || jobs.length >= PER_TABLE_LIMIT ||
    errorLogs.length >= PER_TABLE_LIMIT || aiUsage.length >= PER_TABLE_LIMIT ||
    flowSteps.length >= PER_TABLE_LIMIT || activity.length >= PER_TABLE_LIMIT;

  return json<LoaderData>({
    correlationId,
    apiLogs: apiItems,
    jobs: jobItems,
    errorLogs: errorItems,
    aiUsage: aiItems,
    flowSteps: flowItems,
    activity: activityItems,
    timeline,
    totals: {
      api: apiItems.length,
      jobs: jobItems.length,
      errors: errorItems.length,
      ai: aiItems.length,
      flow: flowItems.length,
      activity: activityItems.length,
    },
    truncated,
  });
}

function statusBadge(status: TraceItem['status']) {
  if (status === 'OK') return <Badge tone="success">OK</Badge>;
  if (status === 'ERROR') return <Badge tone="critical">Error</Badge>;
  if (status === 'WARN') return <Badge tone="warning">Warn</Badge>;
  return <Badge tone="info">Info</Badge>;
}

function ItemList({ items }: { items: TraceItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState heading="No entries" image="">
        <Text as="p" tone="subdued">No log records found for this correlation ID in this view.</Text>
      </EmptyState>
    );
  }
  return (
    <BlockStack gap="200">
      {items.map(item => (
        <Card key={item.id}>
          <BlockStack gap="200">
            <InlineStack gap="300" blockAlign="center" wrap>
              {statusBadge(item.status)}
              <Badge>{item.type}</Badge>
              <Text as="span" variant="bodySm" tone="subdued">
                {new Date(item.createdAt).toLocaleString()}
              </Text>
              {item.shopDomain && (
                <Text as="span" variant="bodySm" tone="subdued">{item.shopDomain}</Text>
              )}
              {item.href && (
                <Link to={item.href} style={{ marginLeft: 'auto' }}>Open</Link>
              )}
            </InlineStack>
            <Text as="p" variant="bodyMd">{item.summary}</Text>
            {item.detail && (
              <pre style={{
                margin: 0,
                padding: 12,
                background: 'var(--p-color-bg-surface-secondary)',
                borderRadius: 8,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 240,
                overflow: 'auto',
              }}>
                {typeof item.detail === 'string' ? item.detail : JSON.stringify(item.detail, null, 2)}
              </pre>
            )}
          </BlockStack>
        </Card>
      ))}
    </BlockStack>
  );
}

export default function InternalTrace() {
  const data = useLoaderData<typeof loader>();
  const [tabIndex, setTabIndex] = useState(0);

  const tabs = [
    { id: 'timeline', content: `Timeline (${data.timeline.length})`, panelID: 'panel-timeline' },
    { id: 'api', content: `API logs (${data.totals.api})`, panelID: 'panel-api' },
    { id: 'jobs', content: `Jobs (${data.totals.jobs})`, panelID: 'panel-jobs' },
    { id: 'errors', content: `Errors (${data.totals.errors})`, panelID: 'panel-errors' },
    { id: 'ai', content: `AI usage (${data.totals.ai})`, panelID: 'panel-ai' },
    { id: 'flow', content: `Flow steps (${data.totals.flow})`, panelID: 'panel-flow' },
    { id: 'activity', content: `Activity (${data.totals.activity})`, panelID: 'panel-activity' },
  ];

  const datasets: TraceItem[][] = [
    data.timeline,
    data.apiLogs,
    data.jobs,
    data.errorLogs,
    data.aiUsage,
    data.flowSteps,
    data.activity,
  ];

  const total =
    data.totals.api + data.totals.jobs + data.totals.errors +
    data.totals.ai + data.totals.flow + data.totals.activity;

  return (
    <Page
      title="Trace"
      subtitle={`Correlation: ${data.correlationId} · ${total} record${total === 1 ? '' : 's'}`}
      backAction={{ content: 'API logs', url: '/internal/api-logs' }}
      fullWidth
    >
      <BlockStack gap="400">
        {data.truncated && (
          <Banner tone="warning" title="Results truncated">
            <Text as="p" variant="bodySm">One or more log tables hit the 200 row limit. Not all records may be shown.</Text>
          </Banner>
        )}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Summary</Text>
            <InlineStack gap="300" wrap>
              <Badge tone="info">{`API ${data.totals.api}`}</Badge>
              <Badge tone="info">{`Jobs ${data.totals.jobs}`}</Badge>
              <Badge tone={data.totals.errors > 0 ? 'critical' : 'info'}>{`Errors ${data.totals.errors}`}</Badge>
              <Badge tone="info">{`AI usage ${data.totals.ai}`}</Badge>
              <Badge tone="info">{`Flow steps ${data.totals.flow}`}</Badge>
              <Badge tone="info">{`Activity ${data.totals.activity}`}</Badge>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              All log records that share this correlationId/requestId, joined into a single timeline.
            </Text>
          </BlockStack>
        </Card>

        <Card padding="0">
          <Tabs tabs={tabs} selected={tabIndex} onSelect={setTabIndex}>
            <Box padding="400">
              <ItemList items={datasets[tabIndex] ?? []} />
            </Box>
          </Tabs>
        </Card>
      </BlockStack>
    </Page>
  );
}

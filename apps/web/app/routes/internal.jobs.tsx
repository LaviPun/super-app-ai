import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form, useRevalidator } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Badge, DataTable, InlineStack,
  TextField, Select, Button, SkeletonBodyText,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { JobService } from '~/services/jobs/job.service';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || undefined;
  const type = url.searchParams.get('type') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const prisma = getPrisma();
  const where: any = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (search) {
    where.OR = [
      { type: { contains: search } },
      { error: { contains: search } },
    ];
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { shop: true },
  });

  const liveJobs = jobs.filter(j => j.status === 'RUNNING' || j.status === 'QUEUED');
  const running = liveJobs.length;
  const failed = jobs.filter(j => j.status === 'FAILED').length;
  const sortedJobs = [...jobs].sort((a, b) => {
    const order = (s: string) => (s === 'RUNNING' ? 0 : s === 'QUEUED' ? 1 : 2);
    return order(a.status) - order(b.status) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const stepLogs = await prisma.flowStepLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { shop: true },
  });

  const distinctTypes = [...new Set(jobs.map(j => j.type))].sort();

  return json({
    liveJobs: liveJobs.map(j => ({
      id: j.id,
      type: j.type,
      status: j.status,
      shopDomain: j.shop?.shopDomain ?? null,
      createdAt: j.createdAt.toISOString(),
    })),
    jobs: sortedJobs.map(j => ({
      id: j.id,
      type: j.type,
      status: j.status,
      error: j.error,
      shopDomain: j.shop?.shopDomain ?? null,
      createdAt: j.createdAt.toISOString(),
    })),
    stepLogs: stepLogs.map(s => ({
      id: s.id,
      step: s.step,
      kind: s.kind,
      status: s.status,
      durationMs: s.durationMs,
      error: s.error,
      shopDomain: s.shop?.shopDomain ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    running,
    failed,
    distinctTypes,
    filters: { status, type, search, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
  });
}

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Queued', value: 'QUEUED' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Success', value: 'SUCCESS' },
  { label: 'Failed', value: 'FAILED' },
];

export default function InternalJobs() {
  const { jobs, liveJobs, stepLogs, running, failed, distinctTypes, filters } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const revalidator = useRevalidator();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  const typeOptions = [
    { label: 'All types', value: '' },
    ...distinctTypes.map(t => ({ label: t, value: t })),
  ];

  return (
    <Page title="Jobs" subtitle={`${running} running · ${failed} failed`}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 140 }}>
                  <Select label="Status" name="status" options={STATUS_OPTIONS} value={filters.status ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('status', v); else p.delete('status'); setParams(p); }} />
                </div>
                <div style={{ minWidth: 180 }}>
                  <Select label="Type" name="type" options={typeOptions} value={filters.type ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('type', v); else p.delete('type'); setParams(p); }} />
                </div>
                <div style={{ minWidth: 200 }}>
                  <TextField label="Search" name="q" value={filters.search ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }} autoComplete="off" placeholder="Search type, error..." />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="From" name="dateFrom" type="date" value={filters.dateFrom?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateFrom', v); else p.delete('dateFrom'); setParams(p); }} autoComplete="off" />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="To" name="dateTo" type="date" value={filters.dateTo?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateTo', v); else p.delete('dateTo'); setParams(p); }} autoComplete="off" />
                </div>
                <Button submit loading={isLoading}>Apply</Button>
                <Button url="/internal/jobs" variant="plain">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        {liveJobs.length > 0 && (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Live (RUNNING / QUEUED) — {liveJobs.length} job(s)</Text>
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">These jobs are in progress.</Text>
                <Button size="slim" onClick={() => revalidator.revalidate()} loading={revalidator.state === 'loading'}>Refresh</Button>
              </InlineStack>
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text']}
                headings={['Time', 'Type', 'Status', 'Store']}
                rows={liveJobs.map(j => [
                  new Date(j.createdAt).toLocaleString(),
                  j.type,
                  <Badge key={j.id} tone="attention">{j.status}</Badge>,
                  j.shopDomain ?? '—',
                ])}
              />
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">All jobs ({jobs.length})</Text>
            <Text as="p" variant="bodySm" tone="subdued">Showing all statuses. Use filters to narrow by status or type.</Text>
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : jobs.length === 0 ? (
              <Text as="p" tone="subdued">No jobs match your filters.</Text>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                headings={['Time', 'Type', 'Status', 'Store', 'Error']}
                rows={jobs.map(j => [
                  new Date(j.createdAt).toLocaleString(),
                  j.type,
                  <Badge key={j.id} tone={j.status === 'FAILED' ? 'critical' : j.status === 'SUCCESS' ? 'success' : 'attention'}>{j.status}</Badge>,
                  j.shopDomain ?? '—',
                  j.error ? <Text key={j.id} as="span" tone="critical">{j.error}</Text> : '—',
                ])}
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Flow step logs ({stepLogs.length})</Text>
            {stepLogs.length === 0 ? (
              <Text as="p" tone="subdued">No step logs yet.</Text>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text']}
                headings={['Time', 'Step', 'Kind', 'Status', 'Duration (ms)', 'Store']}
                rows={stepLogs.map(s => [
                  new Date(s.createdAt).toLocaleString(),
                  String(s.step),
                  s.kind,
                  <Badge key={s.id} tone={s.status === 'SUCCESS' ? 'success' : 'critical'}>{s.status}</Badge>,
                  s.durationMs ?? '—',
                  s.shopDomain ?? '—',
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

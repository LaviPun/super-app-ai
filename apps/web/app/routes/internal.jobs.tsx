import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form, useRevalidator } from '@remix-run/react';
import { useState } from 'react';
import {
  Page, Card, BlockStack, Text, Badge, DataTable, InlineStack,
  TextField, Select, Button, SkeletonBodyText, Modal, Box,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { InternalTruncateCell } from '~/components/InternalTruncateCell';
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
  const jobPayloads = jobs.map(j => ({
    id: j.id,
    payload: j.payload,
    result: j.result,
    error: j.error,
    attempts: j.attempts,
    startedAt: j.startedAt?.toISOString() ?? null,
    finishedAt: j.finishedAt?.toISOString() ?? null,
  }));

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
      payload: j.payload,
      result: j.result,
      attempts: j.attempts,
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
      error: j.error,
    })),
    jobs: sortedJobs.map(j => ({
      id: j.id,
      type: j.type,
      status: j.status,
      error: j.error,
      shopDomain: j.shop?.shopDomain ?? null,
      createdAt: j.createdAt.toISOString(),
      payload: j.payload,
      result: j.result,
      attempts: j.attempts,
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
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

type JobDetail = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  shopDomain: string | null;
  createdAt: string;
  payload: string | null;
  result: string | null;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
};

function JobDetailModal({ job, open, onClose }: { job: JobDetail | null; open: boolean; onClose: () => void }) {
  if (!job) return null;
  const preStyle = { margin: 0, padding: 12, background: 'var(--p-color-bg-surface-secondary)', borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, maxHeight: 200, overflow: 'auto' as const };
  return (
    <Modal open={open} onClose={onClose} title="Job details" large secondaryActions={[{ content: 'Close', onAction: onClose }]}>
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" variant="bodySm"><strong>ID</strong>: {job.id}</Text>
          <Text as="p" variant="bodySm"><strong>Type</strong>: {job.type}</Text>
          <Text as="p" variant="bodySm"><strong>Status</strong>: {job.status}</Text>
          <Text as="p" variant="bodySm"><strong>Attempts</strong>: {job.attempts}</Text>
          <Text as="p" variant="bodySm"><strong>Created</strong>: {new Date(job.createdAt).toLocaleString()}</Text>
          {job.startedAt && <Text as="p" variant="bodySm"><strong>Started</strong>: {new Date(job.startedAt).toLocaleString()}</Text>}
          {job.finishedAt && <Text as="p" variant="bodySm"><strong>Finished</strong>: {new Date(job.finishedAt).toLocaleString()}</Text>}
          <Text as="p" variant="bodySm"><strong>Store</strong>: {job.shopDomain ?? '—'}</Text>
          {job.error && (
            <>
              <Text as="p" variant="bodySm" fontWeight="semibold">Error</Text>
              <pre style={preStyle}>{job.error}</pre>
            </>
          )}
          {job.payload && (
            <>
              <Text as="p" variant="bodySm" fontWeight="semibold">Payload</Text>
              <pre style={preStyle}>{job.payload}</pre>
            </>
          )}
          {job.result && (
            <>
              <Text as="p" variant="bodySm" fontWeight="semibold">Result</Text>
              <pre style={preStyle}>{job.result}</pre>
            </>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

export default function InternalJobs() {
  const { jobs, liveJobs, stepLogs, running, failed, distinctTypes, filters } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const revalidator = useRevalidator();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);

  const typeOptions = [
    { label: 'All types', value: '' },
    ...distinctTypes.map(t => ({ label: t, value: t })),
  ];

  return (
    <Page title="Jobs" subtitle={`${running} running · ${failed} failed`}>
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Text as="p" variant="bodySm" tone="subdued">Filter by status, type, search, and date range.</Text>
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
                <Button submit variant="primary" loading={isLoading}>Apply</Button>
                <Button url="/internal/jobs" variant="secondary">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        {liveJobs.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Live jobs</Text>
              <Text as="p" variant="bodySm" tone="subdued">RUNNING or QUEUED — {liveJobs.length} job(s).</Text>
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">These jobs are in progress.</Text>
                <Button size="slim" variant="primary" onClick={() => revalidator.revalidate()} loading={revalidator.state === 'loading'}>Refresh</Button>
              </InlineStack>
              <div className="internal-table-scroll">
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Time', 'Type', 'Status', 'Store', '']}
                  rows={liveJobs.map(j => [
                    new Date(j.createdAt).toLocaleString(),
                    j.type,
                    <Badge key={j.id} tone="attention">{j.status}</Badge>,
                    <InternalTruncateCell key={`store-${j.id}`} value={j.shopDomain} maxLength={40} maxWidthPx={160} />,
                    <Button key={`view-${j.id}`} size="slim" variant="secondary" onClick={() => setSelectedJob(j)}>View</Button>,
                  ])}
                />
              </div>
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">All jobs</Text>
            <Text as="p" variant="bodySm" tone="subdued">Use filters to narrow by status or type.</Text>
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : jobs.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No jobs match your filters.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Widen the date range or clear filters to see more.</Text>
              </BlockStack>
            ) : (
              <div className="internal-table-scroll">
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Time', 'Type', 'Status', 'Store', 'Error', '']}
                  rows={jobs.map(j => [
                    new Date(j.createdAt).toLocaleString(),
                    j.type,
                    <Badge key={j.id} tone={j.status === 'FAILED' ? 'critical' : j.status === 'SUCCESS' ? 'success' : 'attention'}>{j.status}</Badge>,
                    <InternalTruncateCell key={`store-${j.id}`} value={j.shopDomain} maxLength={40} maxWidthPx={160} />,
                    j.error ? <InternalTruncateCell key={`err-${j.id}`} value={j.error} maxLength={80} maxWidthPx={240} tone="critical" /> : '—',
                    <Button key={`view-${j.id}`} size="slim" variant="secondary" onClick={() => setSelectedJob(j)}>View</Button>,
                  ])}
                />
              </div>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Flow step logs</Text>
            {stepLogs.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No step logs yet.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Step logs appear when flows run.</Text>
              </BlockStack>
            ) : (
              <div className="internal-table-scroll">
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text']}
                  headings={['Time', 'Step', 'Kind', 'Status', 'Duration (ms)', 'Store']}
                  rows={stepLogs.map(s => [
                    new Date(s.createdAt).toLocaleString(),
                    String(s.step),
                    s.kind,
                    <Badge key={s.id} tone={s.status === 'SUCCESS' ? 'success' : 'critical'}>{s.status}</Badge>,
                    s.durationMs ?? '—',
                    <span key={`store-${s.id}`} className="internal-truncate" title={s.shopDomain ?? ''}>{s.shopDomain ?? '—'}</span>,
                  ])}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
      <JobDetailModal job={selectedJob} open={selectedJob != null} onClose={() => setSelectedJob(null)} />
    </Page>
  );
}

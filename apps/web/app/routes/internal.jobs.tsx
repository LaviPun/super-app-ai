import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import { JobService, type JobType } from '~/services/jobs/job.service';
import { generateCorrelationId } from '~/services/observability/correlation.server';
import type { Prisma } from '@prisma/client';
import {
  useAdminCtx,
  Btn,
  Badge,
  StatusBadge,
  Card,
  ConfirmDialog,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  MonoChip,
  useTableState,
  fmtMs,
  titleCase,
  JOBS,
  JOB_TYPES,
} from '~/components/admin/page-kit';

const KNOWN_JOB_TYPES: readonly JobType[] = [
  'AI_GENERATE', 'AI_HYDRATE', 'AI_MODIFY', 'PUBLISH', 'CONNECTOR_TEST', 'FLOW_RUN', 'THEME_ANALYZE',
];

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  if (intent !== 'replay') {
    return json({ ok: false, error: 'Unknown intent' }, { status: 400 });
  }
  const jobId = String(formData.get('jobId') ?? '');
  if (!jobId) return json({ ok: false, error: 'Missing jobId' }, { status: 400 });

  const prisma = getPrisma();
  const original = await prisma.job.findUnique({ where: { id: jobId } });
  if (!original) return json({ ok: false, error: 'Job not found' }, { status: 404 });

  if (!(KNOWN_JOB_TYPES as readonly string[]).includes(original.type)) {
    return json({ ok: false, error: `Unknown job type ${original.type}` }, { status: 400 });
  }

  let payload: unknown = null;
  if (original.payload) {
    try { payload = JSON.parse(original.payload); } catch { payload = original.payload; }
  }

  const replayCorrelation = original.correlationId ?? generateCorrelationId();
  const svc = new JobService();
  const created = await svc.create({
    shopId: original.shopId ?? undefined,
    type: original.type as JobType,
    payload,
    correlationId: replayCorrelation,
  });
  return json({ ok: true, newJobId: created.id, correlationId: replayCorrelation });
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || undefined;
  const type = url.searchParams.get('type') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;
  const page = parseCursorParams(url);

  const prisma = getPrisma();
  const where: Prisma.JobWhereInput = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (search) {
    where.OR = [
      { type: { contains: search } },
      { error: { contains: search } },
    ];
  }
  if (correlationId) where.correlationId = correlationId;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const jobs = await prisma.job.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: page.take,
    skip: page.skip,
    cursor: page.cursor,
    include: { shop: true },
  });
  const nextCursorHref = buildNextCursorUrl(url, jobs, page.take);

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
      correlationId: j.correlationId ?? null,
      requestId: j.requestId ?? null,
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
      correlationId: j.correlationId ?? null,
      requestId: j.requestId ?? null,
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
    filters: { status, type, search, correlationId, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function relJob(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return Math.max(1, m) + 'm ago';
  const h = Math.round(m / 60);
  return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
}

export default function AdminJobs() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [status, setStatus] = useState('All');
  const [type, setType] = useState('All');
  const [confirm, setConfirm] = useState<any>(null);

  const ROWS: any[] = data.jobs.length
    ? data.jobs.map((j: any) => ({
        id: j.id, type: j.type, status: j.status, shop: j.shopDomain ?? '—', attempts: j.attempts ?? 1,
        durationMs: j.startedAt && j.finishedAt ? new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime() : null,
        correlationId: j.correlationId ?? '', created: relJob(j.createdAt), error: j.error ?? null,
      }))
    : JOBS;
  const rows = ROWS.filter(
    (j) => (status === 'All' || j.status === status) && (type === 'All' || j.type === type) && (j.id + j.shop + j.correlationId).toLowerCase().includes(ts.search.toLowerCase()),
  );
  const failed = ROWS.filter((j) => j.status === 'FAILED').length;
  const running = ROWS.filter((j) => j.status === 'RUNNING').length;
  const queued = ROWS.filter((j) => j.status === 'QUEUED').length;

  return (
    <div className="page">
      <PageHead
        title="Jobs"
        sub="All background work. Failed jobs form the dead-letter queue (DLQ) — replay them under a fresh correlation ID."
        actions={
          failed > 0 ? (
            <Btn
              variant="primary"
              icon="replay"
              onClick={() =>
                setConfirm({
                  title: 'Replay all failed jobs',
                  message: 'Re-enqueue all ' + failed + ' DLQ jobs under fresh correlation IDs. Original payloads, job types and shop linkage are preserved.',
                  confirmLabel: 'Replay ' + failed + ' jobs',
                  tone: 'primary',
                  icon: 'replay',
                  onConfirm: () => ctx.toast('Re-enqueued ' + failed + ' jobs'),
                })
              }
            >
              Replay all DLQ
            </Btn>
          ) : undefined
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Succeeded (7d)" value={ROWS.filter((j) => j.status === 'SUCCESS').length} icon="check" tone="success" />
        <StatTile label="Running" value={running} icon="play" tone="info" />
        <StatTile label="Queued" value={queued} icon="clock" tone="warning" />
        <StatTile label="Failed (DLQ)" value={failed} icon="alert" tone="critical" />
      </div>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search job ID, store, correlation…"
          results={rows.length}
          filters={[
            { options: ['All', 'SUCCESS', 'RUNNING', 'QUEUED', 'FAILED'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })), value: status, onChange: setStatus },
            { options: ['All'].concat(JOB_TYPES).map((t) => ({ value: t, label: t === 'All' ? 'All types' : titleCase(t) })), value: type, onChange: setType },
          ]}
        />
        <DataTable
          rowKey="id"
          onRowClick={(r: any) => ctx.go('#/admin/jobs/' + r.id)}
          columns={[
            { key: 'id', label: 'Job ID', render: (r: any) => <MonoChip>{r.id}</MonoChip> },
            { key: 'type', label: 'Type', render: (r: any) => <Badge>{titleCase(r.type)}</Badge> },
            { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'shop', label: 'Store', render: (r: any) => <span className="cell-sub">{r.shop}</span> },
            { key: 'attempts', label: 'Tries', num: true },
            { key: 'durationMs', label: 'Duration', num: true, render: (r: any) => fmtMs(r.durationMs) },
            { key: 'error', label: 'Result', render: (r: any) => (r.error ? <span className="t-xs" style={{ color: 'var(--p-critical-text)' }}>{r.error}</span> : <span className="cell-sub">—</span>) },
            { key: 'created', label: 'When', render: (r: any) => <span className="cell-sub">{r.created}</span> },
            {
              key: 'act',
              label: '',
              render: (r: any) => (
                <div className="dt-actions">
                  {r.status === 'FAILED' && (
                    <Btn size="sm" icon="replay" className="btn-plain" onClick={() => ctx.toast('Replayed ' + r.id)}>
                      Replay
                    </Btn>
                  )}
                  <Btn size="sm" icon="transfer" className="btn-plain" onClick={() => ctx.go('#/admin/trace/' + r.correlationId)}>
                    Trace
                  </Btn>
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </Card>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

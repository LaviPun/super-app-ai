import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import type { Prisma } from '@prisma/client';
import {
  useAdminCtx,
  useAdminOps,
  Btn,
  Badge,
  StatusBadge,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  PageHead,
  FilterBar,
  StatTile,
  MonoChip,
  useTableState,
  fmtMs,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';

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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [jobs, succeeded7d, running, queued, failed, typeRows] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.take,
      skip: page.skip,
      cursor: page.cursor,
      include: { shop: true },
    }),
    prisma.job.count({ where: { status: 'SUCCESS', createdAt: { gte: sevenDaysAgo } } }),
    prisma.job.count({ where: { status: 'RUNNING' } }),
    prisma.job.count({ where: { status: 'QUEUED' } }),
    prisma.job.count({ where: { status: 'FAILED' } }),
    prisma.job.findMany({ distinct: ['type'], select: { type: true }, orderBy: { type: 'asc' } }),
  ]);
  const nextCursorHref = buildNextCursorUrl(url, jobs, page.take);

  const sortedJobs = [...jobs].sort((a, b) => {
    const order = (s: string) => (s === 'RUNNING' ? 0 : s === 'QUEUED' ? 1 : 2);
    return order(a.status) - order(b.status) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return json({
    jobs: sortedJobs.map(j => ({
      id: j.id,
      type: j.type,
      status: j.status,
      error: j.error,
      shopDomain: j.shop?.shopDomain ?? null,
      createdAt: j.createdAt.toISOString(),
      attempts: j.attempts,
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
      correlationId: j.correlationId ?? null,
    })),
    counts: { succeeded7d, running, queued, failed },
    distinctTypes: typeRows.map(t => t.type),
    filters: { status, type, search, correlationId, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AdminJobs() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [status, setStatus] = useState('All');
  const [type, setType] = useState('All');
  const [confirm, setConfirm] = useState<any>(null);

  // Replays go through the audited /internal/ops path (job_replay / job_replay_all).
  const ops = useAdminOps();
  const replayBusy = ops.busy;
  const pendingIntent = String(ops.pendingFormData?.get('intent') ?? '');
  const pendingJobId = pendingIntent === 'job_replay' ? String(ops.pendingFormData?.get('id') ?? '') : '';
  const replayAllBusy = pendingIntent === 'job_replay_all';

  const submitReplay = (jobId: string) => ops.run('job_replay', { id: jobId, message: 'Replay job' });
  const submitReplayAll = () => ops.run('job_replay_all', { message: 'Replay all DLQ jobs' });

  const ROWS: any[] = data.jobs.map((j: any) => ({
    id: j.id, type: j.type, status: j.status, shop: j.shopDomain ?? '—', attempts: j.attempts ?? 1,
    durationMs: j.startedAt && j.finishedAt ? new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime() : null,
    correlationId: j.correlationId ?? '', created: formatRelativeTime(j.createdAt), error: j.error ?? null,
  }));
  const rows = ROWS.filter(
    (j) => (status === 'All' || j.status === status) && (type === 'All' || j.type === type) && (j.id + j.shop + j.correlationId).toLowerCase().includes(ts.search.toLowerCase()),
  );
  const { succeeded7d, running, queued, failed } = data.counts;

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
              loading={replayAllBusy}
              disabled={replayBusy}
              onClick={() =>
                setConfirm({
                  title: 'Replay all failed jobs',
                  message: 'Re-enqueue all ' + failed + ' DLQ jobs. Original payloads, job types, shop linkage and correlation IDs are preserved.',
                  confirmLabel: 'Replay ' + failed + ' jobs',
                  tone: 'primary',
                  icon: 'replay',
                  onConfirm: submitReplayAll,
                })
              }
            >
              Replay all DLQ
            </Btn>
          ) : undefined
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Succeeded (7d)" value={succeeded7d} icon="check" tone="success" />
        <StatTile label="Running" value={running} icon="play" tone="info" />
        <StatTile label="Queued" value={queued} icon="clock" tone="warning" />
        <StatTile label="Failed (DLQ)" value={failed} icon="alert" tone="critical" />
      </div>
      <Card>
        {data.jobs.length === 0 ? (
          <EmptyState icon="work" title="No jobs yet">
            Background jobs will appear here as merchants generate, hydrate and publish modules.
          </EmptyState>
        ) : (
          <>
            <FilterBar
              search={ts.search}
              onSearch={ts.setSearch}
              placeholder="Search job ID, store, correlation…"
              results={rows.length}
              filters={[
                { options: ['All', 'SUCCESS', 'RUNNING', 'QUEUED', 'FAILED'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })), value: status, onChange: setStatus },
                { options: ['All'].concat(data.distinctTypes).map((t) => ({ value: t, label: t === 'All' ? 'All types' : titleCase(t) })), value: type, onChange: setType },
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
                        <Btn
                          size="sm"
                          icon="replay"
                          className="btn-plain"
                          loading={pendingJobId === r.id}
                          disabled={replayBusy}
                          onClick={(e: any) => {
                            e.stopPropagation();
                            submitReplay(r.id);
                          }}
                        >
                          Replay
                        </Btn>
                      )}
                      {r.correlationId ? (
                        <Btn
                          size="sm"
                          icon="transfer"
                          className="btn-plain"
                          onClick={(e: any) => {
                            e.stopPropagation();
                            ctx.go('#/admin/trace/' + r.correlationId);
                          }}
                        >
                          Trace
                        </Btn>
                      ) : null}
                    </div>
                  ),
                },
              ]}
              rows={rows}
            />
          </>
        )}
      </Card>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

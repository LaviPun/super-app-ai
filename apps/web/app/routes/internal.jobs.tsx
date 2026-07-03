import { json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
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
  EmptyState,
  PageHead,
  FilterBar,
  StatTile,
  MonoChip,
  useTableState,
  fmtMs,
  titleCase,
} from '~/components/admin/page-kit';

const KNOWN_JOB_TYPES: readonly JobType[] = [
  'AI_GENERATE', 'AI_HYDRATE', 'AI_MODIFY', 'PUBLISH', 'CONNECTOR_TEST', 'FLOW_RUN', 'THEME_ANALYZE',
];

/** Max failed jobs re-enqueued by a single "Replay all DLQ" request. */
const REPLAY_ALL_LIMIT = 500;

function parseJobPayload(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  const prisma = getPrisma();
  const svc = new JobService();

  if (intent === 'replay') {
    const jobId = String(formData.get('jobId') ?? '');
    if (!jobId) return json({ ok: false, message: 'Missing jobId' }, { status: 400 });

    const original = await prisma.job.findUnique({ where: { id: jobId } });
    if (!original) return json({ ok: false, message: 'Job not found' }, { status: 404 });

    if (!(KNOWN_JOB_TYPES as readonly string[]).includes(original.type)) {
      return json({ ok: false, message: `Unknown job type ${original.type}` }, { status: 400 });
    }

    const replayCorrelation = original.correlationId ?? generateCorrelationId();
    const created = await svc.create({
      shopId: original.shopId ?? undefined,
      type: original.type as JobType,
      payload: parseJobPayload(original.payload),
      correlationId: replayCorrelation,
    });
    return json({ ok: true, message: 'Replayed ' + jobId + ' as ' + created.id, newJobId: created.id, correlationId: replayCorrelation });
  }

  if (intent === 'replay_all') {
    const failedJobs = await prisma.job.findMany({
      where: { status: 'FAILED', type: { in: [...KNOWN_JOB_TYPES] } },
      orderBy: { createdAt: 'desc' },
      take: REPLAY_ALL_LIMIT,
    });
    if (failedJobs.length === 0) {
      return json({ ok: false, message: 'No failed jobs to replay' }, { status: 400 });
    }
    const created = await Promise.all(
      failedJobs.map((original) =>
        svc.create({
          shopId: original.shopId ?? undefined,
          type: original.type as JobType,
          payload: parseJobPayload(original.payload),
          correlationId: original.correlationId ?? generateCorrelationId(),
        }),
      ),
    );
    return json({ ok: true, message: 'Re-enqueued ' + created.length + ' failed jobs', replayed: created.length });
  }

  return json({ ok: false, message: 'Unknown intent' }, { status: 400 });
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

  const replayFetcher = useFetcher<typeof action>();
  const replayBusy = replayFetcher.state !== 'idle';
  const pendingJobId = replayBusy ? String(replayFetcher.formData?.get('jobId') ?? '') : '';

  useEffect(() => {
    if (replayFetcher.state === 'idle' && replayFetcher.data) {
      ctx.toast(replayFetcher.data.message, !replayFetcher.data.ok);
    }
  }, [replayFetcher.state, replayFetcher.data, ctx]);

  const submitReplay = (jobId: string) => {
    const fd = new FormData();
    fd.set('intent', 'replay');
    fd.set('jobId', jobId);
    replayFetcher.submit(fd, { method: 'post' });
  };
  const submitReplayAll = () => {
    const fd = new FormData();
    fd.set('intent', 'replay_all');
    replayFetcher.submit(fd, { method: 'post' });
  };

  const ROWS: any[] = data.jobs.map((j: any) => ({
    id: j.id, type: j.type, status: j.status, shop: j.shopDomain ?? '—', attempts: j.attempts ?? 1,
    durationMs: j.startedAt && j.finishedAt ? new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime() : null,
    correlationId: j.correlationId ?? '', created: relJob(j.createdAt), error: j.error ?? null,
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
              loading={replayBusy && replayFetcher.formData?.get('intent') === 'replay_all'}
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

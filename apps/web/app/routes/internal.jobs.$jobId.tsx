import { json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  useAdminCtx,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Banner,
  KV,
  PageHead,
  StatTile,
  MonoChip,
  fmtMs,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';

const NOT_FOUND = new Response(null, { status: 404 });

function prettyJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export async function loader({ request, params }: { request: Request; params: { jobId?: string } }) {
  await requireInternalAdmin(request);
  const jobId = params.jobId;
  if (!jobId) throw NOT_FOUND;

  const prisma = getPrisma();
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { shop: true },
  });
  if (!job) throw NOT_FOUND;

  return json({
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    error: job.error,
    payload: prettyJson(job.payload),
    result: prettyJson(job.result),
    shopDomain: job.shop?.shopDomain ?? null,
    requestId: job.requestId ?? null,
    correlationId: job.correlationId ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    durationMs:
      job.startedAt && job.finishedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null,
  });
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

type TimelineEvent = { key: string; label: string; when: string; detail: string; durationMs: number | null; critical: boolean };

function EventRow({ e }: { e: TimelineEvent }) {
  return (
    <div className="tl-item">
      <span className={'tl-dot ' + (e.critical ? 'critical' : 'success')} />
      <div className="row spread">
        <span className="t-sm t-strong">{e.label}</span>
        <span className="t-xs t-muted">{fmtWhen(e.when)}</span>
      </div>
      <div className="row spread">
        <span className="t-xs" style={{ color: e.critical ? 'var(--p-critical-text)' : 'var(--p-text-secondary)' }}>
          {e.detail}
        </span>
        <span className="t-xs t-muted t-num">{e.durationMs != null ? fmtMs(e.durationMs) : ''}</span>
      </div>
    </div>
  );
}

export default function AdminJobDetail() {
  const j = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();

  const replayFetcher = useFetcher<{ ok: boolean; message: string }>();
  const replayBusy = replayFetcher.state !== 'idle';
  useEffect(() => {
    if (replayFetcher.state === 'idle' && replayFetcher.data) {
      ctx.toast(replayFetcher.data.message, !replayFetcher.data.ok);
    }
  }, [replayFetcher.state, replayFetcher.data, ctx]);
  const replay = () => {
    const fd = new FormData();
    fd.set('intent', 'replay');
    fd.set('jobId', j.id);
    replayFetcher.submit(fd, { method: 'post', action: '/internal/jobs' });
  };

  // Real lifecycle events from the job row's timestamps — no fabricated attempt logs.
  const events: TimelineEvent[] = [
    { key: 'created', label: 'Queued', when: j.createdAt, detail: titleCase(j.type) + ' job created', durationMs: null, critical: false },
  ];
  if (j.startedAt) {
    events.push({
      key: 'started',
      label: 'Started',
      when: j.startedAt,
      detail: j.attempts > 1 ? 'Picked up by worker (attempt ' + j.attempts + ')' : 'Picked up by worker',
      durationMs: null,
      critical: false,
    });
  }
  if (j.finishedAt) {
    events.push({
      key: 'finished',
      label: j.status === 'FAILED' ? 'Failed' : 'Finished',
      when: j.finishedAt,
      detail: j.status === 'FAILED' ? (j.error ?? 'Job failed') : 'Completed successfully',
      durationMs: j.durationMs,
      critical: j.status === 'FAILED',
    });
  }

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/jobs', label: 'Jobs' }}
        title={titleCase(j.type)}
        badge={<StatusBadge value={j.status} />}
        sub={
          <span className="row-2">
            <MonoChip>{j.id}</MonoChip>
            <span className="t-muted">·</span>
            <span className="t-sm">{j.shopDomain ?? 'No store'}</span>
          </span>
        }
        actions={
          <>
            {j.correlationId ? (
              <Btn icon="transfer" onClick={() => ctx.go('#/admin/trace/' + j.correlationId)}>
                View trace
              </Btn>
            ) : null}
            {j.status === 'FAILED' && (
              <Btn variant="primary" icon="replay" loading={replayBusy} disabled={replayBusy} onClick={replay}>
                Replay job
              </Btn>
            )}
          </>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Status" value={titleCase(j.status)} icon={j.status === 'FAILED' ? 'alert' : 'check'} tone={j.status === 'FAILED' ? 'critical' : j.status === 'QUEUED' ? 'warning' : 'success'} />
        <StatTile label="Attempts" value={j.attempts} icon="replay" tone={j.attempts > 1 ? 'warning' : 'info'} />
        <StatTile label="Duration" value={j.durationMs != null ? fmtMs(j.durationMs) : '—'} icon="clock" tone="info" />
        <StatTile label="Created" value={formatRelativeTime(j.createdAt)} sub={fmtWhen(j.createdAt)} icon="work" tone="info" />
      </div>
      {j.status === 'FAILED' && j.error ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="critical" title="Job failed">
            {j.error}
          </Banner>
        </div>
      ) : null}
      <div className="col-main">
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>
            Job details
          </div>
          <KV
            rows={[
              ['Job ID', <MonoChip key="id">{j.id}</MonoChip>],
              ['Type', <Badge key="ty">{titleCase(j.type)}</Badge>],
              ['Store', j.shopDomain ?? '—'],
              [
                'Correlation ID',
                j.correlationId ? (
                  <a key="cor" href={'/internal/trace/' + j.correlationId} className="cell-link t-mono">
                    {j.correlationId}
                  </a>
                ) : (
                  '—'
                ),
              ],
              ['Request ID', j.requestId ? <MonoChip key="req">{j.requestId}</MonoChip> : '—'],
              ['Status', <StatusBadge key="st" value={j.status} />],
              ['Attempts', j.attempts],
              ['Created', fmtWhen(j.createdAt)],
            ]}
          />
          <div className="divider" style={{ margin: '14px 0' }} />
          <div className="t-h3" style={{ marginBottom: 10 }}>
            Payload
          </div>
          {j.payload ? <pre className="code-block">{j.payload}</pre> : <span className="t-muted t-sm">No payload was recorded for this job.</span>}
          {j.result ? (
            <>
              <div className="divider" style={{ margin: '14px 0' }} />
              <div className="t-h3" style={{ marginBottom: 10 }}>
                Result
              </div>
              <pre className="code-block">{j.result}</pre>
            </>
          ) : null}
        </Card>
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>
            Execution timeline
          </div>
          <div className="timeline">
            {events.map((e) => (
              <EventRow key={e.key} e={e} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

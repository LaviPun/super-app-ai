import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
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
  JOBS,
  jobPayload,
  jobAttempts,
} from '~/components/admin/page-kit';

export async function loader({ request, params }: { request: Request; params: { jobId?: string } }) {
  await requireInternalAdmin(request);
  // Placeholder-backed detail (no per-job backend read in this surface).
  const job = JOBS.find((j) => j.id === params.jobId) ?? JOBS[0];
  return json({ job, payload: jobPayload(job), attempts: jobAttempts(job) });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function AttemptRow({ a }: { a: any }) {
  return (
    <div className="tl-item">
      <span className={'tl-dot ' + (a.status === 'FAILED' ? 'critical' : 'success')} />
      <div className="row spread">
        <span className="t-sm t-strong">Attempt {a.n}</span>
        <span className="t-xs t-muted">{a.when}</span>
      </div>
      <div className="row spread">
        <span className="t-xs" style={{ color: a.status === 'FAILED' ? 'var(--p-critical-text)' : 'var(--p-text-secondary)' }}>
          {a.detail}
        </span>
        <span className="t-xs t-muted t-num">{fmtMs(a.durationMs)}</span>
      </div>
    </div>
  );
}

export default function AdminJobDetail() {
  const { job: j, payload, attempts } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const replay = () => ctx.toast('Replayed ' + j.id);

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
            <span className="t-sm">{j.shop}</span>
          </span>
        }
        actions={
          <>
            <Btn icon="transfer" onClick={() => ctx.go('#/admin/trace/' + j.correlationId)}>
              View trace
            </Btn>
            {j.status === 'FAILED' && (
              <Btn variant="primary" icon="replay" onClick={replay}>
                Replay job
              </Btn>
            )}
          </>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Status" value={titleCase(j.status)} icon={j.status === 'FAILED' ? 'alert' : 'check'} tone={j.status === 'FAILED' ? 'critical' : j.status === 'QUEUED' ? 'warning' : 'success'} />
        <StatTile label="Attempts" value={j.attempts} sub="max 5" icon="replay" tone={j.attempts > 1 ? 'warning' : 'info'} />
        <StatTile label="Duration" value={j.durationMs ? fmtMs(j.durationMs) : '—'} icon="clock" tone="info" />
        <StatTile label="Created" value={j.created} icon="work" tone="info" />
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
              ['Store', j.shop],
              [
                'Correlation ID',
                <a key="cor" href={'/internal/trace/' + j.correlationId} className="cell-link t-mono">
                  {j.correlationId}
                </a>,
              ],
              ['Status', <StatusBadge key="st" value={j.status} />],
              ['Attempts', j.attempts + ' / 5'],
              ['Created', j.created],
            ]}
          />
          <div className="divider" style={{ margin: '14px 0' }} />
          <div className="t-h3" style={{ marginBottom: 10 }}>
            Payload
          </div>
          <pre className="code-block">{payload}</pre>
        </Card>
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>
            Attempt history
          </div>
          <div className="timeline">
            {attempts.map((a: any) => (
              <AttemptRow key={a.n} a={a} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

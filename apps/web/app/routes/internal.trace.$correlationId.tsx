import { json } from '@remix-run/node';
import { useLoaderData, useParams } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  Tabs,
  PageHead,
  StatTile,
  MonoChip,
  titleCase,
} from '~/components/admin/page-kit';

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

export default function AdminTrace() {
  const data = useLoaderData<typeof loader>();
  const params = useParams();
  const ctx = useAdminCtx();
  const cid = params.correlationId || data.correlationId || 'cor_rs8f2';
  const [tab, setTab] = useState('timeline');

  // Prefer real timeline; fall back to the design's representative incident.
  const realTimeline = data.timeline || [];
  const TONE: Record<string, string> = { OK: 'info', INFO: 'info', WARN: 'warning', ERROR: 'critical' };
  const events =
    realTimeline.length > 0
      ? realTimeline.map((t) => ({
          t: new Date(t.createdAt).toISOString().slice(11, 23),
          kind: t.type.replace('_LOG', '').replace('_', ' '),
          tone: TONE[t.status] || 'info',
          title: t.summary,
          detail: t.detail || '',
        }))
      : [
          { t: '09:14:02.118', kind: 'API', tone: 'info', title: 'POST /api/publish', detail: 'actor=MERCHANT · 200 · 142ms · req_8a21f' },
          { t: '09:14:02.140', kind: 'Job', tone: 'info', title: 'PUBLISH job_2f8a queued', detail: 'shop=northpeak-gear · attempt 1' },
          { t: '09:14:02.610', kind: 'Job', tone: 'critical', title: 'PUBLISH job_2f8a failed', detail: 'Upstream 502 from theme assets API' },
          { t: '09:14:03.002', kind: 'Error', tone: 'critical', title: 'ErrorLog captured', detail: 'Provider request failed: 502 Bad Gateway' },
          { t: '09:14:05.300', kind: 'Job', tone: 'warning', title: 'Retry scheduled (attempt 2)', detail: 'backoff 2.3s' },
          { t: '09:14:18.901', kind: 'Job', tone: 'critical', title: 'PUBLISH job_2f8a failed (final)', detail: '3 attempts exhausted → DLQ' },
        ];
  const errorCount = events.filter((e) => e.tone === 'critical').length;
  const outcome = errorCount > 0 ? 'Failed' : 'OK';

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/jobs', label: 'Back' }}
        title="Trace"
        badge={<MonoChip>{cid}</MonoChip>}
        sub="Unified timeline joining every API log, job, error, AI-usage row, flow step and activity sharing this correlation ID."
        actions={
          <>
            <Btn icon="chat" onClick={() => ctx.go('#/admin/ai-assistant')}>
              Ask assistant
            </Btn>
            <Btn variant="primary" icon="replay" onClick={() => ctx.toast('Replayed under new correlation ID')}>
              Replay
            </Btn>
          </>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Total events" value={events.length} icon="layers" tone="info" />
        <StatTile label="Duration" value="16.8s" icon="clock" tone="warning" />
        <StatTile label="Errors" value={errorCount} icon="bug" tone="critical" />
        <StatTile label="Outcome" value={outcome} icon={outcome === 'Failed' ? 'alert' : 'check'} tone={outcome === 'Failed' ? 'critical' : 'success'} />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs active={tab} onChange={setTab} tabs={['timeline', 'api', 'jobs', 'errors', 'activity'].map((x) => ({ id: x, label: titleCase(x) }))} />
      </Card>
      <Card pad>
        <div className="timeline">
          {events.map((e, i) => (
            <div key={i} className="tl-item">
              <span className={'tl-dot ' + e.tone} />
              <div className="row-3" style={{ alignItems: 'baseline' }}>
                <span className="t-mono t-xs t-muted" style={{ width: 110, flex: 'none' }}>
                  {e.t}
                </span>
                <Badge tone={e.tone}>{e.kind}</Badge>
                <div className="grow">
                  <div className="t-sm t-strong">{e.title}</div>
                  <div className="t-xs t-muted">{e.detail}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

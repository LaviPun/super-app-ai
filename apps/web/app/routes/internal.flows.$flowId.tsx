import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  useAdminOps,
  StoreLink,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Tabs,
  EmptyState,
  DataTable,
  PageHead,
  StatTile,
  MonoChip,
  fmtNum,
  fmtMs,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';

const NOT_FOUND = new Response(null, { status: 404 });

function payloadFlowId(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const p = JSON.parse(payload);
    return typeof p?.flowId === 'string' ? p.flowId : null;
  } catch {
    return null;
  }
}

function resultSteps(result: string | null): number | null {
  if (!result) return null;
  try {
    const r = JSON.parse(result);
    return typeof r?.steps === 'number' ? r.steps : null;
  } catch {
    return null;
  }
}

// Map a FlowStep.kind to the design's node-type buckets (tone-coded in the UI).
function nodeTypeOf(kind: string): string {
  const k = String(kind || '').toUpperCase();
  if (k === 'CONDITION') return 'condition';
  if (k === 'TRANSFORM') return 'transform';
  if (k === 'DELAY' || k === 'WAIT') return 'delay';
  if (k === 'END') return 'end';
  return 'action';
}

export async function loader({ request, params }: { request: Request; params: { flowId?: string } }) {
  await requireInternalAdmin(request);
  const id = params.flowId;
  if (!id) throw NOT_FOUND;

  const prisma = getPrisma();
  const m = await prisma.module.findUnique({
    where: { id },
    include: {
      shop: { select: { shopDomain: true } },
      activeVersion: { select: { specJson: true } },
      versions: { orderBy: { version: 'desc' }, take: 1, select: { specJson: true } },
    },
  });
  if (!m || m.type !== 'flow.automation') throw NOT_FOUND;

  // Parse the flow definition (trigger + steps).
  let trigger = '—';
  let stepDefs: Array<{ kind: string }> = [];
  const specJson = m.activeVersion?.specJson ?? m.versions[0]?.specJson;
  if (specJson) {
    try {
      const spec = JSON.parse(specJson);
      if (typeof spec?.config?.trigger === 'string') trigger = spec.config.trigger;
      if (Array.isArray(spec?.config?.steps)) stepDefs = spec.config.steps;
    } catch {
      /* leave defaults */
    }
  }

  // This flow's FLOW_RUN jobs (payload.flowId === module id).
  const shopJobs = await prisma.job.findMany({
    where: { type: 'FLOW_RUN', shopId: m.shopId },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { id: true, payload: true, status: true, error: true, result: true, createdAt: true, startedAt: true, finishedAt: true },
  });
  const flowJobs = shopJobs.filter((j) => payloadFlowId(j.payload) === m.id);

  const since7d = new Date(Date.now() - 7 * 86400000);
  const runs7d = flowJobs.filter((j) => j.createdAt >= since7d).length;
  const fails7d = flowJobs.filter((j) => j.createdAt >= since7d && j.status === 'FAILED').length;
  const latestJob = flowJobs[0] ?? null;

  // Latest run's per-step execution logs (real) to annotate the step definitions.
  const stepLogs = latestJob
    ? await prisma.flowStepLog.findMany({
        where: { jobId: latestJob.id },
        orderBy: { step: 'asc' },
        select: { step: true, status: true, durationMs: true },
      })
    : [];
  const logByStep = new Map(stepLogs.map((l) => [l.step, l]));

  const steps = [
    {
      stepId: 'trigger',
      nodeType: 'trigger',
      nodeName: trigger,
      status: latestJob ? 'SUCCESS' : 'PENDING',
      durationMs: null as number | null,
    },
    ...stepDefs.map((s, i) => {
      const log = logByStep.get(i);
      return {
        stepId: 'n' + i,
        nodeType: nodeTypeOf(s.kind),
        nodeName: titleCase(s.kind || 'Step'),
        status: log?.status ?? 'PENDING',
        durationMs: log?.durationMs ?? null,
      };
    }),
  ];

  const status =
    m.status === 'PUBLISHED' ? 'ACTIVE' : m.status === 'ARCHIVED' ? 'DRAFT' : m.activeVersionId ? 'PAUSED' : 'DRAFT';

  return json({
    flow: {
      id: m.id,
      name: m.name,
      trigger,
      steps: steps.length,
      status,
      store: m.shop.shopDomain.split('.')[0] ?? m.shop.shopDomain,
      storeId: m.shopId,
      runs7d,
      fails7d,
      lastRun: latestJob ? formatRelativeTime(new Date(latestJob.createdAt).toISOString()) : '—',
    },
    steps,
    runs: flowJobs.slice(0, 20).map((j) => ({
      id: j.id,
      status: j.status,
      steps: resultSteps(j.result) ?? stepDefs.length,
      durationMs: j.startedAt && j.finishedAt ? new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime() : null,
      started: formatRelativeTime(new Date(j.createdAt).toISOString()),
      error: j.error,
    })),
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const NODE_TONE: Record<string, any> = { trigger: 'magic', condition: 'warning', action: 'info', transform: 'success', delay: undefined, end: undefined };

function FlowStepRow({ s, i, total }: { s: any; i: number; total: number }) {
  return (
    <div className="flow-step">
      <div className="flow-step-rail">
        <span className="flow-step-num">{i + 1}</span>
        {i < total - 1 ? <span className="flow-step-line" /> : null}
      </div>
      <div className="flow-step-body card" style={{ padding: '12px 14px' }}>
        <div className="row spread">
          <div className="row-2">
            <Badge tone={NODE_TONE[s.nodeType]}>{titleCase(s.nodeType)}</Badge>
            <span className="t-strong t-sm">{s.nodeName}</span>
          </div>
          <div className="row-2">
            {s.status !== 'PENDING' ? <span className="t-xs t-muted t-num">{fmtMs(s.durationMs)}</span> : null}
            <StatusBadge value={s.status} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminFlowDetail() {
  const { flow: f, steps, runs } = useLoaderData<typeof loader>();
  const ops = useAdminOps();
  const [tab, setTab] = useState('steps');
  const toggle = () =>
    ops.run(f.status === 'ACTIVE' ? 'flow_pause' : 'flow_resume', {
      id: f.id,
      resource: f.name,
      message: f.status === 'ACTIVE' ? 'Pausing ' + f.name : 'Resuming ' + f.name,
    });

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/flows', label: 'Flows' }}
        title={f.name}
        badge={<StatusBadge value={f.status} />}
        sub={
          <span className="row-2">
            <MonoChip>{f.trigger}</MonoChip>
            <span className="t-muted">·</span>
            <StoreLink name={f.store} id={f.storeId} />
          </span>
        }
        actions={
          <>
            {f.status !== 'DRAFT' &&
              (f.status === 'ACTIVE' ? (
                <Btn icon="pause" onClick={toggle}>
                  Pause
                </Btn>
              ) : (
                <Btn icon="play" onClick={toggle}>
                  Resume
                </Btn>
              ))}
            <Btn variant="primary" icon="rocket" onClick={() => ops.run('flow_run', { id: f.id, resource: f.name, message: 'Enqueuing test run for ' + f.name })}>
              Run now
            </Btn>
          </>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Steps" value={f.steps} icon="flow" tone="info" />
        <StatTile label="Runs (7d)" value={fmtNum(f.runs7d)} icon="rocket" tone="magic" />
        <StatTile label="Failures (7d)" value={f.fails7d || 0} icon="alert" tone={f.fails7d ? 'critical' : 'success'} />
        <StatTile label="Last run" value={f.lastRun} icon="clock" tone="info" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'steps', label: 'Steps', badge: f.steps },
            { id: 'runs', label: 'Run history', badge: runs.length },
          ]}
        />
      </Card>
      {tab === 'steps' ? (
        <Card pad>
          <div className="flow-steps">
            {steps.map((s: any, i: number) => (
              <FlowStepRow key={s.stepId} s={s} i={i} total={steps.length} />
            ))}
          </div>
        </Card>
      ) : null}
      {tab === 'runs' ? (
        <Card>
          {runs.length ? (
            <DataTable
              rowKey="id"
              columns={[
                { key: 'id', label: 'Run', render: (r: any) => <MonoChip>{r.id}</MonoChip> },
                { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
                { key: 'steps', label: 'Steps', num: true, render: (r: any) => r.steps },
                { key: 'durationMs', label: 'Duration', num: true, render: (r: any) => <span className="t-num">{fmtMs(r.durationMs)}</span> },
                { key: 'error', label: 'Detail', render: (r: any) => (r.error ? <span className="t-xs" style={{ color: 'var(--p-critical-text)' }}>{r.error}</span> : <span className="t-muted t-xs">Completed cleanly</span>) },
                { key: 'started', label: 'Started', render: (r: any) => <span className="cell-sub">{r.started}</span> },
              ]}
              rows={runs}
            />
          ) : (
            <EmptyState icon="flow" title="No runs yet">
              This flow has no recorded runs. Publish and trigger it (or use “Run now”) to see run history.
            </EmptyState>
          )}
        </Card>
      ) : null}
    </div>
  );
}

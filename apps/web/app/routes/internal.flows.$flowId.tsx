import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
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
  FLOWS,
  flowSteps,
  flowRuns,
} from '~/components/admin/page-kit';

export async function loader({ request, params }: { request: Request; params: { flowId?: string } }) {
  await requireInternalAdmin(request);
  const f = FLOWS.find((x) => x.id === params.flowId) ?? FLOWS[0];
  return json({ flow: f, steps: flowSteps(f), runs: flowRuns(f) });
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
  const ctx = useAdminCtx();
  const [tab, setTab] = useState('steps');
  const toggle = () => ctx.toast(f.name + (f.status === 'ACTIVE' ? ' paused' : ' resumed'));

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
            <Btn variant="primary" icon="rocket" onClick={() => ctx.toast('Test run enqueued')}>
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
                { key: 'id', label: 'Run', render: (r: any) => <MonoChip>{r.id.replace('run_' + f.id + '_', 'run #')}</MonoChip> },
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
              This flow is a draft. Publish and trigger it to see run history.
            </EmptyState>
          )}
        </Card>
      ) : null}
    </div>
  );
}

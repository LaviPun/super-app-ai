import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { getPrisma } from '~/db.server';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getRecentPublishMetrics } from '~/services/releases/release-metrics.server';
import {
  readRollbackBudgetThresholdsFromEnv,
  RolloutPolicyService,
} from '~/services/releases/rollout-policy.service';
import {
  Badge,
  Banner,
  Card,
  DataTable,
  EmptyState,
  MonoChip,
  PageHead,
  MiniBars,
  fmtMs,
  fmtNum,
} from '~/components/admin/page-kit';

type TransitionDetail = {
  actor?: string;
  source?: string;
  idempotency_key?: string;
  from?: string;
  to?: string;
  result?: string;
  error_class?: string | null;
  moduleId?: string;
  moduleVersionId?: string;
};

function parseDetails(raw: string | null): TransitionDetail {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TransitionDetail;
  } catch {
    return {};
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[index] ?? 0;
}

const WINDOW_MINUTES = 30;
const BUCKETS = 10;

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const [auditRows, metrics30m, publishLogs] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: 'RELEASE_TRANSITION' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, shopId: true, createdAt: true, details: true },
    }),
    getRecentPublishMetrics({ windowMinutes: WINDOW_MINUTES }),
    prisma.apiLog.findMany({
      where: {
        path: { in: ['/api/publish'] },
        createdAt: { gte: since },
        finishedAt: { not: null },
      },
      select: { createdAt: true, success: true, status: true, durationMs: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const transitions = auditRows.map((row) => ({
    id: row.id,
    shopId: row.shopId,
    createdAt: row.createdAt.toISOString(),
    ...parseDetails(row.details),
  }));

  const resultCounts = transitions.reduce<Record<string, number>>((acc, row) => {
    const key = row.result ?? 'UNKNOWN';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const sourceCounts = transitions.reduce<Record<string, number>>((acc, row) => {
    const key = row.source ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const errorClassCounts = transitions.reduce<Record<string, number>>((acc, row) => {
    if (!row.error_class) return acc;
    acc[row.error_class] = (acc[row.error_class] ?? 0) + 1;
    return acc;
  }, {});

  // Real per-bucket series over the 30-minute publish window (10 x 3-minute buckets).
  const bucketMs = (WINDOW_MINUTES * 60_000) / BUCKETS;
  const errorBars = new Array<number>(BUCKETS).fill(0);
  const sampleBars = new Array<number>(BUCKETS).fill(0);
  const latencySamples: number[][] = Array.from({ length: BUCKETS }, () => []);
  for (const log of publishLogs) {
    const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor((log.createdAt.getTime() - since.getTime()) / bucketMs)));
    sampleBars[idx]! += 1;
    if (!log.success || log.status >= 500) errorBars[idx]! += 1;
    latencySamples[idx]!.push(Math.max(0, log.durationMs));
  }
  const latencyBars = latencySamples.map((bucket) => Math.round(percentile(bucket, 0.95)));

  // Real per-bucket FAILED counts across the span of the returned transitions.
  const failedBars = new Array<number>(BUCKETS).fill(0);
  if (transitions.length > 0) {
    const times = auditRows.map((r) => r.createdAt.getTime());
    const oldest = Math.min(...times);
    const newest = Math.max(...times);
    const span = Math.max(1, newest - oldest);
    for (const row of auditRows) {
      const detail = parseDetails(row.details);
      if (detail.result !== 'FAILED') continue;
      const idx = Math.min(BUCKETS - 1, Math.floor(((row.createdAt.getTime() - oldest) / span) * BUCKETS));
      failedBars[idx]! += 1;
    }
  }

  const policy = readRollbackBudgetThresholdsFromEnv();
  const gate = new RolloutPolicyService(policy).evaluate(metrics30m);

  return json({
    metrics30m,
    resultCounts,
    sourceCounts,
    errorClassCounts,
    transitions,
    policy,
    gate: { decision: gate.decision, reasons: gate.reasons },
    series: { errorBars, latencyBars, sampleBars, failedBars },
  });
}

function fmtPct(rate: number): string {
  return (rate * 100).toFixed(1) + '%';
}

const RESULT_TONE: Record<string, 'success' | 'critical' | 'info' | undefined> = {
  SUCCEEDED: 'success',
  FAILED: 'critical',
  ATTEMPT: 'info',
  IDEMPOTENT: undefined,
};

export default function AdminRelease() {
  const data = useLoaderData<typeof loader>();
  const { metrics30m, policy, gate, series, resultCounts, transitions } = data;

  const failedTransitions = resultCounts.FAILED ?? 0;
  const transitionFailureRate = transitions.length > 0 ? failedTransitions / transitions.length : 0;

  const metrics = [
    {
      label: 'Error rate (30m publishes)',
      value: fmtPct(metrics30m.errorRate),
      threshold: 'Threshold ' + fmtPct(policy.maxErrorRate),
      ok: metrics30m.errorRate <= policy.maxErrorRate,
      badge: metrics30m.errorRate <= policy.maxErrorRate ? 'OK' : 'Breached',
      badgeTone: metrics30m.errorRate <= policy.maxErrorRate ? 'success' : 'critical',
      bars: series.errorBars,
    },
    {
      label: 'P95 latency (30m publishes)',
      value: fmtMs(metrics30m.p95LatencyMs),
      threshold: 'Threshold ' + fmtMs(policy.maxP95LatencyMs),
      ok: metrics30m.p95LatencyMs <= policy.maxP95LatencyMs,
      badge: metrics30m.p95LatencyMs <= policy.maxP95LatencyMs ? 'OK' : 'Breached',
      badgeTone: metrics30m.p95LatencyMs <= policy.maxP95LatencyMs ? 'success' : 'critical',
      bars: series.latencyBars,
    },
    {
      label: 'Publish samples (30m)',
      value: fmtNum(metrics30m.sampleSize),
      threshold: 'Min sample ' + fmtNum(policy.minSampleSize),
      ok: metrics30m.sampleSize >= policy.minSampleSize,
      badge: metrics30m.sampleSize >= policy.minSampleSize ? 'OK' : 'Low sample',
      badgeTone: metrics30m.sampleSize >= policy.minSampleSize ? 'success' : 'warning',
      bars: series.sampleBars,
    },
    {
      label: 'Transition failure rate (last ' + transitions.length + ')',
      value: fmtPct(transitionFailureRate),
      threshold: 'Threshold ' + fmtPct(policy.maxErrorRate),
      ok: transitionFailureRate <= policy.maxErrorRate,
      badge: transitionFailureRate <= policy.maxErrorRate ? 'OK' : 'Breached',
      badgeTone: transitionFailureRate <= policy.maxErrorRate ? 'success' : 'critical',
      bars: series.failedBars,
    },
  ];

  const gateBadge =
    gate.decision === 'PROMOTE'
      ? { tone: 'success' as const, label: 'Gate healthy' }
      : gate.decision === 'HOLD'
        ? { tone: 'warning' as const, label: 'Gate holding' }
        : { tone: 'critical' as const, label: 'Gate breached' };

  const banner =
    gate.decision === 'PROMOTE'
      ? {
          tone: 'success',
          title: 'All metrics within thresholds',
          body:
            'Generation is running in live mode. ' +
            fmtNum(metrics30m.sampleSize) +
            ' publish samples in the last 30 minutes. Rolling buffer: last ' +
            transitions.length +
            ' transitions.',
        }
      : gate.decision === 'HOLD'
        ? {
            tone: 'warning',
            title: 'Gate holding — insufficient signal',
            body: gate.reasons.join(' ') || 'Waiting for enough publish samples to evaluate the gate.',
          }
        : {
            tone: 'critical',
            title: 'Gate breached — shadow mode is forced on',
            body: gate.reasons.join(' '),
          };

  const recentTransitions = transitions.slice(0, 50);

  return (
    <div className="page">
      <PageHead
        title="Release Dashboard"
        sub="Live release-gate metrics. If any metric breaches its threshold, shadow mode is forced on automatically."
        badge={
          <Badge tone={gateBadge.tone} dot>
            {gateBadge.label}
          </Badge>
        }
      />
      <div style={{ marginBottom: 16 }}>
        <Banner tone={banner.tone} title={banner.title}>
          {banner.body}
        </Banner>
      </div>
      <div className="grid grid-2">
        {metrics.map((m, i) => (
          <Card key={i} pad>
            <div className="row spread" style={{ marginBottom: 10 }}>
              <span className="t-sm t-strong">{m.label}</span>
              <Badge tone={m.badgeTone} dot>
                {m.badge}
              </Badge>
            </div>
            <div className="row spread" style={{ alignItems: 'flex-end' }}>
              <div>
                <div className="metric-val" style={{ fontSize: 30 }}>
                  {m.value}
                </div>
                <div className="t-xs t-muted" style={{ marginTop: 2 }}>
                  {m.threshold}
                </div>
              </div>
              <div style={{ width: 150 }}>
                <MiniBars data={m.bars} color={m.ok ? 'var(--p-success)' : 'var(--p-critical)'} height={40} />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card style={{ marginTop: 16 }}>
        <div className="card-head">
          <div className="t-h3">Recent release transitions</div>
          <span className="t-xs t-muted">last {recentTransitions.length} of {transitions.length}</span>
        </div>
        {recentTransitions.length === 0 ? (
          <EmptyState icon="layers" title="No release transitions yet">
            Release transitions will appear here as modules move through generate → preview → publish.
          </EmptyState>
        ) : (
          <DataTable
            rowKey="id"
            columns={[
              {
                key: 'createdAt',
                label: 'Time',
                render: (r: (typeof recentTransitions)[number]) => (
                  <span className="t-xs t-muted">{new Date(r.createdAt).toLocaleString()}</span>
                ),
              },
              {
                key: 'transition',
                label: 'Transition',
                render: (r: (typeof recentTransitions)[number]) => (
                  <span className="t-sm">
                    {r.from ?? '—'} <span className="t-muted">→</span> {r.to ?? '—'}
                  </span>
                ),
              },
              {
                key: 'result',
                label: 'Result',
                render: (r: (typeof recentTransitions)[number]) => (
                  <Badge tone={RESULT_TONE[r.result ?? '']}>{r.result ?? 'UNKNOWN'}</Badge>
                ),
              },
              { key: 'source', label: 'Source', render: (r: (typeof recentTransitions)[number]) => r.source ?? '—' },
              { key: 'actor', label: 'Actor', render: (r: (typeof recentTransitions)[number]) => r.actor ?? '—' },
              {
                key: 'error_class',
                label: 'Error class',
                render: (r: (typeof recentTransitions)[number]) =>
                  r.error_class ? <MonoChip>{r.error_class}</MonoChip> : <span className="t-muted">—</span>,
              },
              {
                key: 'moduleId',
                label: 'Module',
                render: (r: (typeof recentTransitions)[number]) =>
                  r.moduleId ? <MonoChip>{r.moduleId}</MonoChip> : <span className="t-muted">—</span>,
              },
            ]}
            rows={recentTransitions}
          />
        )}
      </Card>
    </div>
  );
}

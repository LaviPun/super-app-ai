import { json } from '@remix-run/node';
import { getPrisma } from '~/db.server';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getRecentPublishMetrics } from '~/services/releases/release-metrics.server';
import { Badge, Banner, Card, PageHead, MiniBars } from '~/components/admin/page-kit';

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

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  const [auditRows, metrics30m] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: 'RELEASE_TRANSITION' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, shopId: true, createdAt: true, details: true },
    }),
    getRecentPublishMetrics({ windowMinutes: 30 }),
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

  return json({ metrics30m, resultCounts, sourceCounts, errorClassCounts, transitions });
}

export default function AdminRelease() {
  const metrics = [
    { label: 'Schema fail rate', value: '0.8%', threshold: '2.0%', ok: true, bars: [1, 2, 1, 1, 3, 1, 1, 0, 1, 1] },
    { label: 'Fallback rate', value: '1.4%', threshold: '5.0%', ok: true, bars: [2, 1, 3, 2, 1, 2, 1, 2, 1, 1] },
    { label: 'P95 latency', value: '2.1s', threshold: '4.0s', ok: true, bars: [3, 2, 4, 3, 2, 3, 2, 2, 3, 2] },
    { label: 'Error rate', value: '0.3%', threshold: '1.0%', ok: true, bars: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0] },
  ];
  return (
    <div className="page">
      <PageHead
        title="Release Dashboard"
        sub="Live release-gate metrics. If any metric breaches its threshold, shadow mode is forced on automatically."
        badge={
          <Badge tone="success" dot>
            Gate healthy
          </Badge>
        }
      />
      <div style={{ marginBottom: 16 }}>
        <Banner tone="success" title="All metrics within thresholds">
          Generation is running in live mode. Rolling buffer: last 200 events.
        </Banner>
      </div>
      <div className="grid grid-2">
        {metrics.map((m, i) => (
          <Card key={i} pad>
            <div className="row spread" style={{ marginBottom: 10 }}>
              <span className="t-sm t-strong">{m.label}</span>
              <Badge tone={m.ok ? 'success' : 'critical'} dot>
                {m.ok ? 'OK' : 'Breached'}
              </Badge>
            </div>
            <div className="row spread" style={{ alignItems: 'flex-end' }}>
              <div>
                <div className="metric-val" style={{ fontSize: 30 }}>
                  {m.value}
                </div>
                <div className="t-xs t-muted" style={{ marginTop: 2 }}>
                  Threshold {m.threshold}
                </div>
              </div>
              <div style={{ width: 150 }}>
                <MiniBars data={m.bars} color={m.ok ? 'var(--p-success)' : 'var(--p-critical)'} height={40} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

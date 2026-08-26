import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { FunnelService } from '~/services/observability/funnel.service';
import {
  useAdminCtx,
  ALink,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHead,
  FilterBar,
  StatTile,
  MonoChip,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';

const ALLOWED_WINDOW_DAYS = [1, 7, 30];
const DEFAULT_WINDOW_DAYS = 7;

function pct(rate: number): string {
  return Math.round(rate * 1000) / 10 + '%';
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get('days'));
  const days = ALLOWED_WINDOW_DAYS.includes(requestedDays) ? requestedDays : DEFAULT_WINDOW_DAYS;

  const stats = await new FunnelService().windowStats(days);

  // QA render-QA/richness telemetry lands in Task 15 — until then this stays
  // null and the page renders an EmptyState in its place (D8: an honest "not
  // wired up yet" beats a fabricated number).
  const qa = null;

  return json({ stats, qa });
}

export default function AdminFunnel() {
  const { stats, qa } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();

  const days = stats.windowDays;
  // Headline tone: red below 50% end-to-end, amber below 90%, green otherwise —
  // this is the "99.9%" launch-program metric, so anything under 90% is a
  // ship-blocking signal, not just cosmetic.
  const endToEndTone = stats.endToEndRate < 0.5 ? 'critical' : stats.endToEndRate < 0.9 ? 'warning' : 'success';

  const failureRows = stats.recentFailures.map((f) => ({
    id: f.jobId,
    type: f.type,
    correlationId: f.correlationId,
    error: f.error,
    shop: f.shopDomain ?? '—',
    createdAt: f.createdAt,
  }));

  return (
    <div className="page">
      <PageHead
        title="Generation funnel"
        sub={`Prompt → publish success rate over the last ${days} day${days === 1 ? '' : 's'}.`}
      />
      <div style={{ marginBottom: 16 }}>
        <FilterBar
          filters={[
            {
              options: [
                { value: '1', label: 'Last 1 day' },
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
              ],
              value: String(days),
              onChange: (value: string) => ctx.go(`#/admin/funnel?days=${value}`),
            },
          ]}
        />
      </div>
      <div className="grid grid-5" style={{ marginBottom: 16 }}>
        <StatTile label="Classified" value={stats.classified} icon="magic" tone="info" sub={`AI_GENERATE jobs (${days}d)`} />
        <StatTile label="Optioned" value={stats.optioned} icon="layers" tone="info" sub={pct(stats.optionedRate)} />
        <StatTile label="Hydrated" value={stats.hydrated} icon="database" tone="info" sub={pct(stats.hydratedRate)} />
        <StatTile label="Published" value={stats.published} icon="rocket" tone="info" sub={pct(stats.publishedRate)} />
        <StatTile label="End-to-end" value={pct(stats.endToEndRate)} icon="chart" tone={endToEndTone} sub="Published / classified" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        {failureRows.length === 0 ? (
          <EmptyState icon="check" title="No recent failures">
            Every generate, hydrate and publish job in scope has been succeeding.
          </EmptyState>
        ) : (
          <DataTable
            rowKey="id"
            columns={[
              { key: 'id', label: 'Job ID', render: (r) => <MonoChip>{r.id}</MonoChip> },
              { key: 'type', label: 'Type', render: (r) => <Badge>{titleCase(r.type)}</Badge> },
              {
                key: 'correlationId',
                label: 'Correlation',
                render: (r) =>
                  r.correlationId ? (
                    <MonoChip>
                      <ALink to={`#/admin/jobs?correlationId=${r.correlationId}`}>{r.correlationId}</ALink>
                    </MonoChip>
                  ) : (
                    <span className="cell-sub">—</span>
                  ),
              },
              { key: 'shop', label: 'Store', render: (r) => <span className="cell-sub">{r.shop}</span> },
              { key: 'error', label: 'Error', render: (r) => <span className="t-xs" style={{ color: 'var(--p-critical-text)' }}>{r.error}</span> },
              { key: 'createdAt', label: 'When', render: (r) => <span className="cell-sub">{formatRelativeTime(r.createdAt)}</span> },
            ]}
            rows={failureRows}
          />
        )}
      </Card>
      <Card>
        {qa ? null : (
          <EmptyState icon="chart" title="QA telemetry not wired up yet">
            Render-QA and richness-floor pass rates will appear here once the QA telemetry summary lands.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}

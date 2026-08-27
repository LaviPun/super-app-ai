import { json, redirect } from '@remix-run/node';
import { useLoaderData, useSubmit } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { FunnelService } from '~/services/observability/funnel.service';
import { QaTelemetryService } from '~/services/observability/qa-telemetry.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  useAdminCtx,
  ALink,
  Badge,
  Btn,
  Card,
  CardHead,
  ConfirmDialog,
  DataTable,
  EmptyState,
  PageHead,
  FilterBar,
  StatTile,
  MonoChip,
  titleCase,
  formatRelativeTime,
  fmtNum,
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
  const qa = await new QaTelemetryService().topIssues(days);

  return json({ stats, qa });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const issueId = String(form.get('issueId') ?? '');

  if ((intent === 'promote' || intent === 'demote') && issueId) {
    const promoted = intent === 'promote';
    await new QaTelemetryService().setPromoted(issueId, promoted);
    await new ActivityLogService().log({
      actor: 'INTERNAL_ADMIN',
      action: 'QA_ISSUE_PROMOTION',
      resource: `qa:${issueId}`,
      details: { promoted },
    });
  }

  const url = new URL(request.url);
  return redirect(`${url.pathname}${url.search}`);
}

export default function AdminFunnel() {
  const { stats, qa } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const submit = useSubmit();
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone: string;
    icon: string;
    onConfirm: () => void;
  } | null>(null);

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
        {/* Fix round 1 (controller ruling): recentFailures is deliberately NOT
            scoped to the days switcher above (hydrate/publish jobs have no
            natural window relationship to the generate window) — the header
            says so explicitly so it never reads as a window-scoped count like
            the tiles above it. */}
        <CardHead title="Recent failures (all time)" sub="Latest 20 across AI_GENERATE, AI_HYDRATE and PUBLISH — not limited to the window selected above." />
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
        <CardHead
          title="QA telemetry"
          sub={`Top design/render/richness QA issues across generated options (${days}d). Promoting an issue escalates it from warn to blocking for future generations.`}
        />
        {qa.topIssues.length === 0 ? (
          <EmptyState icon="chart" title="No QA issues recorded">
            Every generated option in this window passed design/render/richness QA cleanly.
          </EmptyState>
        ) : (
          <DataTable
            rowKey="issueId"
            columns={[
              { key: 'issueId', label: 'Issue', render: (r) => <MonoChip>{r.issueId}</MonoChip> },
              { key: 'count', label: 'Occurrences', num: true, render: (r) => fmtNum(r.count) },
              {
                key: 'promoted',
                label: 'Status',
                render: (r) =>
                  r.promoted ? <Badge tone="critical">Promoted (blocking)</Badge> : <Badge>Warn</Badge>,
              },
              {
                key: 'act',
                label: '',
                render: (r) =>
                  r.promoted ? (
                    <Btn
                      size="sm"
                      onClick={() => submit({ intent: 'demote', issueId: r.issueId }, { method: 'post' })}
                    >
                      Demote
                    </Btn>
                  ) : (
                    <Btn
                      size="sm"
                      variant="critical"
                      onClick={() =>
                        setConfirm({
                          title: 'Promote QA issue to blocking',
                          message: `Promote "${r.issueId}" to blocking? Every future generation whose QA gate reports this issue as a warning will be escalated to a failure and enter the corrective-regeneration loop — this changes generation behavior for ALL merchants immediately.`,
                          confirmLabel: 'Promote to blocking',
                          tone: 'critical',
                          icon: 'alert',
                          onConfirm: () => submit({ intent: 'promote', issueId: r.issueId }, { method: 'post' }),
                        })
                      }
                    >
                      Promote
                    </Btn>
                  ),
              },
            ]}
            rows={qa.topIssues}
          />
        )}
      </Card>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

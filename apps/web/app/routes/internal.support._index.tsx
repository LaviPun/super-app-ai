import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { useEffect, useState } from 'react';
import type { Prisma } from '@prisma/client';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import {
  useAdminCtx,
  Icon,
  Btn,
  Badge,
  Banner,
  Card,
  DataTable,
  EmptyState,
  PageHead,
  FilterBar,
  StatTile,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';

// Severity → Badge tone. critical is the only "loud" tone; low has no tone.
const SEVERITY_TONE: Record<string, any> = { critical: 'critical', high: 'warning', medium: 'info', low: undefined };
// Ticket status → Badge tone.
const STATUS_TONE: Record<string, any> = { OPEN: 'info', AI_RESPONDED: 'success', ESCALATED: 'warning', RESOLVED: undefined };

const STATUS_VALUES = ['OPEN', 'AI_RESPONDED', 'ESCALATED', 'RESOLVED'];
const SEVERITY_VALUES = ['critical', 'high', 'medium', 'low'];
const SOURCE_VALUES = ['MERCHANT', 'SHOPPER'];

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || undefined;
  const status = url.searchParams.get('status') || undefined;
  const severity = url.searchParams.get('severity') || undefined;
  const source = url.searchParams.get('source') || undefined;
  const intervention = url.searchParams.get('intervention') || undefined; // 'needs' | 'none'
  const { cursor, take, skip } = parseCursorParams(url);

  const prisma = getPrisma();

  // Cross-shop query — no shopId scoping. Hand-built where so free text can OR
  // across the shop relation (shop.shopDomain) alongside subject/aiSummary.
  const where: Prisma.SupportTicketWhereInput = {};
  if (status && STATUS_VALUES.includes(status)) where.status = status;
  if (severity && SEVERITY_VALUES.includes(severity)) where.aiSeverity = severity;
  if (source && SOURCE_VALUES.includes(source)) where.source = source;
  if (intervention === 'needs') where.needsIntervention = true;
  else if (intervention === 'none') where.needsIntervention = false;
  if (q) {
    where.OR = [
      { subject: { contains: q } },
      { aiSummary: { contains: q } },
      { shop: { shopDomain: { contains: q } } },
    ];
  }

  const since7d = new Date(Date.now() - 7 * 86400000);
  const [tickets, filteredCount, openCount, escalatedCount, interventionCount, triageFailCount, resolved7dCount] =
    await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        cursor,
        include: { shop: true },
      }),
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { status: 'ESCALATED' } }),
      prisma.supportTicket.count({ where: { needsIntervention: true } }),
      prisma.supportTicket.count({ where: { aiTriageError: { not: null }, triagedAt: null } }),
      prisma.supportTicket.count({ where: { status: 'RESOLVED', updatedAt: { gte: since7d } } }),
    ]);

  const nextCursor = buildNextCursorUrl(url, tickets, take);

  return json({
    tickets: tickets.map((t) => ({
      id: t.id,
      shopDomain: t.shop?.shopDomain ?? '—',
      subject: t.subject,
      aiSummary: t.aiSummary ?? null,
      source: t.source,
      severity: t.aiSeverity ?? null,
      status: t.status,
      needsIntervention: t.needsIntervention,
      assignee: t.assignee ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    filters: {
      q: q ?? '',
      status: status ?? 'All',
      severity: severity ?? 'All',
      source: source ?? 'All',
      intervention: intervention ?? 'All',
    },
    nextCursor,
    filteredCount,
    stats: {
      open: openCount,
      escalated: escalatedCount,
      intervention: interventionCount,
      triageFailures: triageFailCount,
      resolved7d: resolved7dCount,
    },
  });
}

type TicketRow = ReturnType<typeof useLoaderData<typeof loader>>['tickets'][number];

export default function AdminSupportQueue() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(data.filters.q);
  const [live, setLive] = useState(false);
  const [liveRows, setLiveRows] = useState<TicketRow[]>([]);

  // Server-side search: debounce the FilterBar input into ?q= the loader reads.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search === (searchParams.get('q') ?? '')) return;
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (search) p.set('q', search);
          else p.delete('q');
          p.delete('cursor');
          return p;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [search, searchParams, setSearchParams]);

  // Live tail: consume the SSE endpoint. New ticket rows are prepended (deduped
  // by id, capped at 200); the EventSource is closed on toggle-off/unmount.
  useEffect(() => {
    if (!live) return;
    const since = data.tickets[0]?.updatedAt ?? new Date().toISOString();
    const es = new EventSource('/internal/support/stream?since=' + encodeURIComponent(since));
    es.addEventListener('log', (evt) => {
      try {
        const row = JSON.parse((evt as MessageEvent).data) as TicketRow;
        setLiveRows((prev) => [row, ...prev.filter((p) => p.id !== row.id)].slice(0, 200));
      } catch {
        // ignore malformed frames
      }
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setLive(false);
        ctx.toast('Live tail disconnected', true);
      }
    };
    return () => es.close();
  }, [live, data.tickets, ctx]);

  const setParam = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value === 'All') p.delete(key);
        else p.set(key, value);
        p.delete('cursor');
        return p;
      },
      { replace: true },
    );
  };
  const goPrevPage = () => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('cursor');
        return p;
      },
      { replace: true },
    );
  };

  // Live rows (if any) take precedence over the paginated set for shared ids.
  const liveIds = new Set(liveRows.map((r) => r.id));
  const rows: TicketRow[] = [...liveRows, ...data.tickets.filter((t) => !liveIds.has(t.id))];

  const hasFilters = Boolean(
    data.filters.q ||
      data.filters.status !== 'All' ||
      data.filters.severity !== 'All' ||
      data.filters.source !== 'All' ||
      data.filters.intervention !== 'All',
  );

  return (
    <div className="page">
      <PageHead
        title="Support CRM"
        sub="Every support ticket across all merchant stores — merchant- and shopper-sourced. Click a ticket to triage, reply, and resolve."
        actions={
          <Btn icon="live" onClick={() => setLive((l) => !l)}>
            {live ? 'Stop tail' : 'Live tail'}
          </Btn>
        }
      />
      <div className="grid grid-5" style={{ marginBottom: 16 }}>
        <StatTile label="Open" value={data.stats.open} icon="chat" tone="info" />
        <StatTile label="Escalated" value={data.stats.escalated} icon="alert" tone="warning" />
        <StatTile label="Needs intervention" value={data.stats.intervention} icon="user" tone="critical" />
        <StatTile label="Triage failures" value={data.stats.triageFailures} icon="bug" tone="critical" />
        <StatTile label="Resolved (7d)" value={data.stats.resolved7d} icon="check" tone="success" />
      </div>
      {live && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="info" title="Live tail active">
            Streaming new and updated tickets via SSE. New rows appear at the top.
          </Banner>
        </div>
      )}
      <Card>
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search subject, AI summary, or store…"
          results={rows.length}
          filters={[
            {
              options: ['All', ...STATUS_VALUES].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })),
              value: data.filters.status,
              onChange: (v: string) => setParam('status', v),
            },
            {
              options: ['All', ...SEVERITY_VALUES].map((s) => ({ value: s, label: s === 'All' ? 'All severities' : titleCase(s) })),
              value: data.filters.severity,
              onChange: (v: string) => setParam('severity', v),
            },
            {
              options: ['All', ...SOURCE_VALUES].map((s) => ({ value: s, label: s === 'All' ? 'All sources' : titleCase(s) })),
              value: data.filters.source,
              onChange: (v: string) => setParam('source', v),
            },
            {
              options: [
                { value: 'All', label: 'All tickets' },
                { value: 'needs', label: 'Needs intervention' },
                { value: 'none', label: 'No intervention' },
              ],
              value: data.filters.intervention,
              onChange: (v: string) => setParam('intervention', v),
            },
          ]}
        />
        {rows.length ? (
          <>
            <DataTable
              rowKey="id"
              onRowClick={(r: TicketRow) => ctx.go('#/admin/support/' + r.id)}
              columns={[
                {
                  key: 'shopDomain',
                  label: 'Store',
                  render: (r: TicketRow) => <span className="cell-sub t-mono">{r.shopDomain}</span>,
                },
                {
                  key: 'subject',
                  label: 'Subject',
                  render: (r: TicketRow) => (
                    <div className="stack" style={{ gap: 2 }}>
                      <span className="row-2">
                        <span className="cell-strong">{r.subject}</span>
                        {r.source === 'SHOPPER' && <Badge tone="magic">Shopper</Badge>}
                      </span>
                      {r.aiSummary && <span className="cell-sub">{r.aiSummary}</span>}
                    </div>
                  ),
                },
                {
                  key: 'severity',
                  label: 'Severity',
                  render: (r: TicketRow) =>
                    r.severity ? <Badge tone={SEVERITY_TONE[r.severity]}>{titleCase(r.severity)}</Badge> : <span className="t-muted">—</span>,
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (r: TicketRow) => <Badge tone={STATUS_TONE[r.status]}>{titleCase(r.status)}</Badge>,
                },
                {
                  key: 'needsIntervention',
                  label: '',
                  render: (r: TicketRow) =>
                    r.needsIntervention ? (
                      <span title="Needs human intervention" style={{ color: 'var(--p-critical)' }}>
                        <Icon name="alert" size={16} />
                      </span>
                    ) : null,
                },
                {
                  key: 'assignee',
                  label: 'Assignee',
                  render: (r: TicketRow) => (r.assignee ? <span className="cell-sub">{r.assignee}</span> : <span className="t-muted">Unassigned</span>),
                },
                {
                  key: 'age',
                  label: 'Age',
                  render: (r: TicketRow) => <span className="cell-sub" title={new Date(r.createdAt).toLocaleString()}>{formatRelativeTime(r.createdAt)}</span>,
                },
              ]}
              rows={rows}
            />
            <div className="table-foot">
              <span>
                Showing {rows.length} of {data.filteredCount} tickets
              </span>
              <div className="row-2">
                <Btn size="sm" icon="chevronLeft" disabled={!searchParams.get('cursor')} onClick={goPrevPage} />
                <Btn size="sm" iconRight="chevronRight" disabled={!data.nextCursor} onClick={() => data.nextCursor && ctx.go(data.nextCursor)}>
                  Next
                </Btn>
              </div>
            </div>
          </>
        ) : (
          <EmptyState icon="chat" title={hasFilters ? 'No tickets match' : 'No tickets yet'}>
            {hasFilters ? 'Try adjusting your search or filters.' : 'Support tickets from merchants and shoppers appear here.'}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}

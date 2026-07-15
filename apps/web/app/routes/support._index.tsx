import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Btn, Badge, Card, PageHead, FilterBar, StatTile, DataTable,
  EmptyState, Modal, Field, Input, Textarea, Select, useTableState, titleCase,
} from '~/components/superapp';
import { SEVERITY_TONE, TICKET_STATUS_LABEL, TicketStatusBadge } from '~/components/support/badges';

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
    });
  }

  const [tickets, modules] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { shopId: shopRow.id },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
    prisma.module.findMany({
      where: { shopId: shopRow.id },
      select: { id: true, name: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
  ]);

  return json({
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      severity: t.aiSeverity,
      category: t.aiCategory,
      summary: t.aiSummary ?? t.description.slice(0, 140),
      source: t.source,
      shopperEmail: t.shopperEmail,
      triageFailed: Boolean(t.aiTriageError),
      updated: timeAgo(t.updatedAt),
    })),
    modules,
    stats: {
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'OPEN' || t.status === 'AI_RESPONDED').length,
      escalated: tickets.filter((t) => t.status === 'ESCALATED').length,
      resolved: tickets.filter((t) => t.status === 'RESOLVED').length,
    },
  });
}

function timeAgo(d: Date | string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function NewTicketModal({ modules, onClose }: { modules: Array<{ id: string; name: string }>; onClose: () => void }) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: boolean; ticketId?: string; triaged?: boolean; error?: string }>();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [moduleId, setModuleId] = useState('');
  const busy = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok && fetcher.data.ticketId) {
      ctx.toast(fetcher.data.triaged ? 'Ticket created — first response ready' : 'Ticket created');
      navigate(`/support/${fetcher.data.ticketId}`);
    }
  }, [fetcher.state, fetcher.data, ctx, navigate]);

  const submit = () => {
    if (!subject.trim() || !description.trim() || busy) return;
    fetcher.submit(
      { subject: subject.trim(), description: description.trim(), moduleId },
      { method: 'post', action: '/api/support/create' },
    );
  };

  return (
    <Modal
      title="Raise an issue"
      sub="Describe the problem — our support team responds right away, usually within a few minutes."
      onClose={onClose}
      footer={(
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="send" disabled={!subject.trim() || !description.trim() || busy} onClick={submit}>
            {busy ? 'Submitting…' : 'Submit ticket'}
          </Btn>
        </>
      )}
    >
      <div className="stack" style={{ gap: 14 }}>
        {fetcher.data?.error && <Badge tone="critical">{fetcher.data.error}</Badge>}
        <Field label="Subject">
          <Input
            placeholder="e.g. Countdown timer not showing on product pages"
            value={subject}
            maxLength={200}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>
        <Field label="What happened?" help="Include what you expected, what you saw instead, and any error text.">
          <Textarea
            rows={5}
            placeholder="The more detail you give, the better the first response…"
            value={description}
            maxLength={5000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {modules.length > 0 && (
          <Field label="Related module" optional>
            <Select
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              options={[{ value: '', label: 'None' }, ...modules.map((m) => ({ value: m.id, label: m.name }))]}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export default function SupportIndex() {
  const data = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <SupportBody {...data} />
    </MerchantShell>
  );
}

function SupportBody({ tickets, modules, stats }: ReturnType<typeof useLoaderData<typeof loader>>) {
  const navigate = useNavigate();
  const ts = useTableState();
  const [status, setStatus] = useState('All');
  const [source, setSource] = useState('All');
  const [formOpen, setFormOpen] = useState(false);

  const rows = tickets.filter((t) =>
    (status === 'All' || t.status === status) &&
    (source === 'All' || t.source === source) &&
    (t.subject + ' ' + t.summary + ' ' + (t.category ?? '')).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="Support"
        sub="Raise issues and track them here — our support team usually responds within a few minutes."
        actions={<Btn variant="primary" icon="plus" onClick={() => setFormOpen(true)}>New ticket</Btn>}
      />
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatTile label="Total tickets" value={stats.total} icon="chat" tone="info" />
        <StatTile label="Open" value={stats.open} icon="clock" tone="warning" />
        <StatTile label="Escalated" value={stats.escalated} icon="alert" tone="critical" />
        <StatTile label="Resolved" value={stats.resolved} icon="check" tone="success" />
      </div>
      <Card>
        <FilterBar
          search={ts.search} onSearch={ts.setSearch} placeholder="Search tickets…"
          filters={[{
            options: ['All', 'OPEN', 'AI_RESPONDED', 'ESCALATED', 'RESOLVED'].map((s) => ({
              value: s,
              label: s === 'All' ? 'All statuses' : (TICKET_STATUS_LABEL[s] ?? titleCase(s)),
            })),
            value: status,
            onChange: setStatus,
          }, {
            options: [
              { value: 'All', label: 'All sources' },
              { value: 'MERCHANT', label: 'My tickets' },
              { value: 'SHOPPER', label: 'From shoppers' },
            ],
            value: source,
            onChange: setSource,
          }]}
          results={rows.length}
        />
        {rows.length === 0 ? (
          <EmptyState
            icon="chat"
            title={tickets.length === 0 ? 'No tickets yet' : 'No tickets match'}
            action={tickets.length === 0
              ? <Btn variant="primary" icon="plus" onClick={() => setFormOpen(true)}>Raise an issue</Btn>
              : <Btn onClick={() => { ts.setSearch(''); setStatus('All'); setSource('All'); }}>Clear filters</Btn>}
          >
            {tickets.length === 0
              ? 'Something not working? Raise an issue and get an instant first response.'
              : 'Try adjusting your search or status filter.'}
          </EmptyState>
        ) : (
          <DataTable
            rowKey="id"
            onRowClick={(r: (typeof rows)[number]) => navigate(`/support/${r.id}`)}
            columns={[
              { key: 'subject', label: 'Ticket', render: (r: (typeof rows)[number]) => (
                <div className="stack" style={{ gap: 1 }}>
                  <span className="row-2">
                    <span className="cell-strong">{r.subject}</span>
                    {r.source === 'SHOPPER' && <Badge tone="info">Shopper</Badge>}
                  </span>
                  <span className="cell-sub t-trunc" style={{ maxWidth: 380 }}>{r.summary}</span>
                </div>
              ) },
              { key: 'severity', label: 'Severity', render: (r: (typeof rows)[number]) =>
                r.severity ? <Badge tone={SEVERITY_TONE[r.severity]}>{titleCase(r.severity)}</Badge>
                : r.triageFailed ? <Badge tone="info">Awaiting reply</Badge>
                : <span className="cell-sub">—</span> },
              { key: 'category', label: 'Category', render: (r: (typeof rows)[number]) =>
                r.category ? titleCase(r.category) : <span className="cell-sub">—</span> },
              { key: 'status', label: 'Status', render: (r: (typeof rows)[number]) => <TicketStatusBadge status={r.status} /> },
              { key: 'updated', label: 'Updated', render: (r: (typeof rows)[number]) => <span className="cell-sub">{r.updated}</span> },
            ]}
            rows={rows}
          />
        )}
      </Card>
      {formOpen && <NewTicketModal modules={modules} onClose={() => setFormOpen(false)} />}
    </div>
  );
}

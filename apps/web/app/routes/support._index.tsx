import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useFetcher } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { EmptyState, LearnMore, StatStrip, titleCase, useCustomEvent } from '~/components/merchant/polaris';
import { SeverityBadge, TICKET_STATUS_LABEL, TicketStatusBadge } from '~/components/support/badges';

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

/**
 * New-ticket form modal. Fields live inside a fetcher.Form; the primary action
 * sits in the modal's `primary-action` slot and submits through a form ref
 * (same idiom as the connectors create modal).
 */
function NewTicketModal({ modules, onClose }: { modules: Array<{ id: string; name: string }>; onClose: () => void }) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: boolean; ticketId?: string; triaged?: boolean; error?: string }>();
  const modalRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const busy = fetcher.state !== 'idle';

  useEffect(() => {
    (modalRef.current as (HTMLElement & { show?: () => void }) | null)?.show?.();
  }, []);
  useCustomEvent(modalRef, 'afterhide', onClose);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok && fetcher.data.ticketId) {
      ctx.toast(fetcher.data.triaged ? 'Ticket created — first response ready' : 'Ticket created');
      navigate(`/support/${fetcher.data.ticketId}`);
    }
  }, [fetcher.state, fetcher.data, ctx, navigate]);

  const submit = () => {
    if (!subject.trim() || !description.trim() || busy) return;
    // Values are trimmed/validated server-side in /api/support/create.
    if (formRef.current) fetcher.submit(formRef.current);
  };

  return (
    <s-modal ref={modalRef as never} heading="Raise an issue">
      <fetcher.Form method="post" action="/api/support/create" ref={formRef}>
        <s-stack gap="base">
          <s-text color="subdued">
            Describe the problem — our support team responds right away, usually within a few minutes.
          </s-text>
          {fetcher.state === 'idle' && fetcher.data?.error && (
            <s-banner tone="critical">{fetcher.data.error}</s-banner>
          )}
          <s-text-field
            label="Subject"
            name="subject"
            placeholder="e.g. Countdown timer not showing on product pages"
            maxLength={200}
            value={subject}
            onInput={(e) => setSubject(e.currentTarget.value ?? '')}
          />
          <s-text-area
            label="What happened?"
            name="description"
            rows={5}
            maxLength={5000}
            placeholder="The more detail you give, the better the first response…"
            details="Include what you expected, what you saw instead, and any error text."
            value={description}
            onInput={(e) => setDescription(e.currentTarget.value ?? '')}
          />
          {modules.length > 0 && (
            <s-select label="Related module (optional)" name="moduleId">
              <s-option value="">None</s-option>
              {modules.map((m) => (
                <s-option key={m.id} value={m.id}>{m.name}</s-option>
              ))}
            </s-select>
          )}
        </s-stack>
      </fetcher.Form>
      <s-button
        slot="primary-action"
        variant="primary"
        icon="send"
        loading={busy || undefined}
        disabled={!subject.trim() || !description.trim() || busy || undefined}
        onClick={submit}
      >
        Submit ticket
      </s-button>
      <s-button slot="secondary-actions" onClick={onClose}>Cancel</s-button>
    </s-modal>
  );
}

export default function SupportIndex() {
  const data = useLoaderData<typeof loader>();
  return (
    <MerchantShell polaris>
      <SupportBody {...data} />
    </MerchantShell>
  );
}

function SupportBody({ tickets, modules, stats }: ReturnType<typeof useLoaderData<typeof loader>>) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [source, setSource] = useState('All');
  const [formOpen, setFormOpen] = useState(false);

  const rows = tickets.filter((t) =>
    (status === 'All' || t.status === status) &&
    (source === 'All' || t.source === source) &&
    (t.subject + ' ' + t.summary + ' ' + (t.category ?? '')).toLowerCase().includes(search.toLowerCase()));

  return (
    <s-page heading="Support" inlineSize="base">
      <s-button slot="primary-action" variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
        New ticket
      </s-button>
      <s-stack gap="base">
      <s-paragraph color="subdued">
        Raise issues and track them here — our support team usually responds within a few minutes.{' '}
        <LearnMore anchor="guide-support" topic="support" />
      </s-paragraph>

      <StatStrip
        items={[
          { label: 'Total tickets', value: stats.total },
          { label: 'Open', value: stats.open },
          { label: 'With the team', value: stats.escalated },
          { label: 'Resolved', value: stats.resolved },
        ]}
      />

      {tickets.length === 0 ? (
        <s-section>
          <EmptyState
            icon="chat"
            heading="No tickets yet"
            action={<s-button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>Raise an issue</s-button>}
          >
            Something not working? Raise an issue and get an instant first response.
          </EmptyState>
        </s-section>
      ) : (
        <s-section padding="none">
          <s-table>
            <s-grid slot="filters" gridTemplateColumns="1fr auto auto auto" gap="small-100" alignItems="center">
              <s-search-field
                label="Search tickets"
                labelAccessibilityVisibility="exclusive"
                placeholder="Search tickets…"
                onInput={(e) => setSearch(e.currentTarget.value ?? '')}
              />
              <s-select
                label="Status"
                labelAccessibilityVisibility="exclusive"
                value={status}
                onChange={(e) => setStatus(e.currentTarget.value)}
              >
                {['All', 'OPEN', 'AI_RESPONDED', 'ESCALATED', 'RESOLVED'].map((s) => (
                  <s-option key={s} value={s}>
                    {s === 'All' ? 'All statuses' : (TICKET_STATUS_LABEL[s] ?? titleCase(s))}
                  </s-option>
                ))}
              </s-select>
              <s-select
                label="Source"
                labelAccessibilityVisibility="exclusive"
                value={source}
                onChange={(e) => setSource(e.currentTarget.value)}
              >
                <s-option value="All">All sources</s-option>
                <s-option value="MERCHANT">My tickets</s-option>
                <s-option value="SHOPPER">From shoppers</s-option>
              </s-select>
              <s-text color="subdued">{rows.length} result{rows.length === 1 ? '' : 's'}</s-text>
            </s-grid>
            <s-table-header-row>
              <s-table-header listSlot="primary">Ticket</s-table-header>
              <s-table-header>Severity</s-table-header>
              <s-table-header>Category</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header listSlot="kicker">Updated</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r) => (
                <s-table-row key={r.id} clickDelegate={`ticket-link-${r.id}`}>
                  <s-table-cell>
                    <s-stack gap="none">
                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-link id={`ticket-link-${r.id}`} onClick={() => navigate(`/support/${r.id}`)}>
                          <s-text type="strong">{r.subject}</s-text>
                        </s-link>
                        {r.source === 'SHOPPER' && <s-badge tone="info">Shopper</s-badge>}
                      </s-stack>
                      <s-text color="subdued">{r.summary}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    {r.severity
                      ? <SeverityBadge severity={r.severity} />
                      : r.triageFailed
                        ? <s-badge tone="info">Awaiting reply</s-badge>
                        : <s-text color="subdued">—</s-text>}
                  </s-table-cell>
                  <s-table-cell>
                    {r.category ? titleCase(r.category) : <s-text color="subdued">—</s-text>}
                  </s-table-cell>
                  <s-table-cell><TicketStatusBadge status={r.status} /></s-table-cell>
                  <s-table-cell><s-text color="subdued">{r.updated}</s-text></s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
          {rows.length === 0 && (
            <EmptyState
              heading="No tickets match"
              action={<s-button onClick={() => { setSearch(''); setStatus('All'); setSource('All'); }}>Clear filters</s-button>}
            >
              Try adjusting your search or status filter.
            </EmptyState>
          )}
        </s-section>
      )}
      </s-stack>
      {formOpen && <NewTicketModal modules={modules} onClose={() => setFormOpen(false)} />}
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';

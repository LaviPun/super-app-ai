import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { Btn, Badge, Card, PageHead, Textarea, Banner, Icon, titleCase } from '~/components/superapp';
import { SUPPORT_AGENT_NAME, TICKET_STATUS_TONE, TicketStatusBadge } from '~/components/support/badges';

export async function loader({ request, params }: { request: Request; params: { ticketId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop }, select: { id: true } });
  if (!shopRow) throw new Response('Not found', { status: 404 });

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.ticketId, shopId: shopRow.id },
    include: { messages: { where: { internal: false }, orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) throw new Response('Not found', { status: 404 });

  return json({
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      source: ticket.source,
      shopperEmail: ticket.shopperEmail,
      severity: ticket.aiSeverity,
      category: ticket.aiCategory,
      summary: ticket.aiSummary,
      confidence: ticket.aiConfidence,
      triageError: ticket.aiTriageError,
      triagedAt: ticket.triagedAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
    },
    messages: ticket.messages.map((m) => ({
      id: m.id,
      role: m.role,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

// "Escalated" only appears as a step when the ticket actually took that path —
// showing it on every ticket implies every ticket will be escalated.
function statusSteps(status: string): Array<{ key: string; label: string }> {
  const base = [
    { key: 'OPEN', label: 'Open' },
    { key: 'AI_RESPONDED', label: 'Answered' },
  ];
  if (status === 'ESCALATED') base.push({ key: 'ESCALATED', label: 'With the team' });
  base.push({ key: 'RESOLVED', label: 'Resolved' });
  return base;
}

// Merchant-facing: assistant replies read as a named support rep, not as AI.
const ROLE_LABEL: Record<string, string> = {
  merchant: 'You',
  assistant: `${SUPPORT_AGENT_NAME} · Support team`,
  human_agent: 'Support team',
  system: 'System',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function TicketDetail() {
  return (
    <MerchantShell>
      <TicketDetailBody />
    </MerchantShell>
  );
}

function TicketDetailBody() {
  const { ticket, messages } = useLoaderData<typeof loader>();
  const ctx = useMerchantCtx();
  const actionFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const replyFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const triageFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [reply, setReply] = useState('');

  const actionBusy = actionFetcher.state !== 'idle';
  const replyBusy = replyFetcher.state !== 'idle';
  const triageBusy = triageFetcher.state !== 'idle';

  useEffect(() => {
    if (actionFetcher.state === 'idle' && actionFetcher.data?.ok) ctx.toast('Ticket updated');
  }, [actionFetcher.state, actionFetcher.data, ctx]);

  useEffect(() => {
    if (replyFetcher.state === 'idle' && replyFetcher.data?.ok) {
      ctx.toast('Reply sent');
      setReply('');
    }
  }, [replyFetcher.state, replyFetcher.data, ctx]);

  useEffect(() => {
    if (triageFetcher.state === 'idle' && triageFetcher.data?.ok) ctx.toast('Response received');
  }, [triageFetcher.state, triageFetcher.data, ctx]);

  const runAction = (intent: string) =>
    actionFetcher.submit({ ticketId: ticket.id, intent }, { method: 'post', action: '/api/support/ticket-action' });

  const sendReply = () => {
    if (!reply.trim() || replyBusy) return;
    replyFetcher.submit(
      { ticketId: ticket.id, intent: 'reply', body: reply.trim() },
      { method: 'post', action: '/api/support/ticket-action' },
    );
  };

  const retryTriage = () =>
    triageFetcher.submit({ ticketId: ticket.id, intent: 'retry_triage' }, { method: 'post', action: '/api/support/ticket-action' });

  const canEscalate = ticket.status !== 'ESCALATED' && ticket.status !== 'RESOLVED';
  const canResolve = ticket.status !== 'RESOLVED';
  const canReopen = ticket.status === 'RESOLVED';
  const fetcherError = actionFetcher.data?.error || replyFetcher.data?.error || triageFetcher.data?.error;

  return (
    <div className="page page-narrow">
      <PageHead
        back={{ href: '/support', label: 'Support' }}
        title={ticket.subject}
        badge={<TicketStatusBadge status={ticket.status} />}
        sub={
          <span className="row-2">
            {ticket.source === 'SHOPPER'
              ? <span>From shopper{ticket.shopperEmail ? ` · ${ticket.shopperEmail}` : ''}</span>
              : <span>Raised by you</span>}
            <span>·</span>
            <span>Opened {timeAgo(ticket.createdAt)}</span>
          </span>
        }
        actions={
          <div className="row-2">
            {canEscalate && (
              <Btn icon="alert" loading={actionBusy} onClick={() => runAction('escalate')}>Escalate to a human</Btn>
            )}
            {canResolve && (
              <Btn variant="primary" icon="check" loading={actionBusy} onClick={() => runAction('resolve')}>Mark resolved</Btn>
            )}
            {canReopen && (
              <Btn icon="refresh" loading={actionBusy} onClick={() => runAction('reopen')}>Reopen</Btn>
            )}
          </div>
        }
      />

      {fetcherError && <Banner tone="critical" title="Something went wrong">{fetcherError}</Banner>}

      <StatusTracker status={ticket.status} />

      {ticket.triageError && (
        <Banner
          tone="info"
          title="We're on it"
          action={<Btn size="sm" icon="refresh" loading={triageBusy} onClick={retryTriage}>Check for a response</Btn>}
        >
          Your ticket has been received and the team has been notified. A first response usually arrives within a few minutes.
        </Banner>
      )}

      <Card pad style={{ marginTop: 16 }}>
        <div className="t-h3" style={{ marginBottom: 14 }}>Conversation</div>
        <div className="stack" style={{ gap: 12 }}>
          {messages.length === 0 && <div className="t-sm t-muted">No messages yet.</div>}
          {messages.map((m) => <MessageBubble key={m.id} role={m.role} body={m.body} createdAt={m.createdAt} />)}
        </div>
        <div className="stack-2" style={{ marginTop: 18 }}>
          <Textarea
            rows={4}
            placeholder="Write a reply…"
            value={reply}
            maxLength={5000}
            disabled={replyBusy}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Btn variant="primary" icon="send" disabled={!reply.trim() || replyBusy} onClick={sendReply}>
              {replyBusy ? 'Sending…' : 'Send reply'}
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

function StatusTracker({ status }: { status: string }) {
  const steps = statusSteps(status);
  const currentIdx = steps.findIndex((s) => s.key === status);
  return (
    <Card pad style={{ marginTop: 16 }}>
      <div className="row-2" style={{ flexWrap: 'wrap', gap: 8 }} role="list" aria-label="Ticket progress">
        {steps.map((step, i) => (
          <span key={step.key} className="row-2" style={{ gap: 8 }} role="listitem">
            {i === currentIdx ? (
              <Badge tone={TICKET_STATUS_TONE[step.key]}>{step.label}</Badge>
            ) : i < currentIdx ? (
              // Done: check icon + weight carry the state, not color alone.
              <span className="row-2 t-xs" style={{ gap: 4, color: 'var(--p-text-secondary)', fontWeight: 600 }}>
                <Icon name="check" size={12} />
                {step.label}
              </span>
            ) : (
              <span className="t-xs" style={{ color: 'var(--p-text-disabled)' }}>{step.label}</span>
            )}
            {i < steps.length - 1 && (
              <span className="t-xs" aria-hidden style={{ color: 'var(--p-text-disabled)' }}>→</span>
            )}
          </span>
        ))}
      </div>
    </Card>
  );
}

function MessageBubble({ role, body, createdAt }: { role: string; body: string; createdAt: string }) {
  if (role === 'system') {
    return (
      <div className="t-xs t-muted" style={{ textAlign: 'center', padding: '2px 0' }}>
        {body} · {timeAgo(createdAt)}
      </div>
    );
  }

  const mine = role === 'merchant';
  return (
    <div className="stack" style={{ gap: 4, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <div className="row-2 t-xs t-muted">
        <span style={{ fontWeight: 600 }}>{ROLE_LABEL[role] ?? titleCase(role)}</span>
        <span>{timeAgo(createdAt)}</span>
      </div>
      <div
        className="t-sm"
        style={{
          maxWidth: '78%',
          padding: '10px 14px',
          borderRadius: 'var(--p-r-lg)',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
          background: mine ? 'var(--p-info-bg)' : 'var(--p-surface-secondary)',
          color: 'var(--p-text)',
          border: '1px solid var(--p-border)',
        }}
      >
        {body}
      </div>
    </div>
  );
}

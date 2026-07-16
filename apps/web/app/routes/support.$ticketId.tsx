import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, useNavigate } from '@remix-run/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { titleCase } from '~/components/merchant/polaris';
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
    <MerchantShell polaris>
      <TicketDetailBody />
    </MerchantShell>
  );
}

function TicketDetailBody() {
  const { ticket, messages } = useLoaderData<typeof loader>();
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const actionFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const replyFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const triageFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const replyFormRef = useRef<HTMLFormElement | null>(null);
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
    // Body is trimmed/validated server-side in /api/support/ticket-action.
    if (replyFormRef.current) replyFetcher.submit(replyFormRef.current);
  };

  const retryTriage = () =>
    triageFetcher.submit({ ticketId: ticket.id, intent: 'retry_triage' }, { method: 'post', action: '/api/support/ticket-action' });

  const canEscalate = ticket.status !== 'ESCALATED' && ticket.status !== 'RESOLVED';
  const canResolve = ticket.status !== 'RESOLVED';
  const canReopen = ticket.status === 'RESOLVED';
  const fetcherError = actionFetcher.data?.error || replyFetcher.data?.error || triageFetcher.data?.error;

  return (
    <s-page heading={ticket.subject} inlineSize="small">
      <s-button
        slot="breadcrumb-actions"
        icon="arrow-left"
        accessibilityLabel="Back to Support"
        onClick={() => navigate('/support')}
      />
      {canEscalate && (
        <s-button slot="secondary-actions" icon="alert-triangle" loading={actionBusy || undefined} onClick={() => runAction('escalate')}>
          Escalate to a human
        </s-button>
      )}
      {canResolve && (
        <s-button slot="primary-action" variant="primary" icon="check" loading={actionBusy || undefined} onClick={() => runAction('resolve')}>
          Mark resolved
        </s-button>
      )}
      {canReopen && (
        <s-button slot="primary-action" icon="refresh" loading={actionBusy || undefined} onClick={() => runAction('reopen')}>
          Reopen
        </s-button>
      )}

      <s-stack direction="inline" gap="small-100" alignItems="center">
        <TicketStatusBadge status={ticket.status} />
        <s-text color="subdued">
          {ticket.source === 'SHOPPER'
            ? `From shopper${ticket.shopperEmail ? ` · ${ticket.shopperEmail}` : ''}`
            : 'Raised by you'}
          {' · '}Opened {timeAgo(ticket.createdAt)}
        </s-text>
      </s-stack>

      {fetcherError && (
        <s-banner tone="critical" heading="Something went wrong">{fetcherError}</s-banner>
      )}

      <StatusTracker status={ticket.status} />

      {ticket.triageError && (
        <s-banner tone="info" heading="We're on it">
          Your ticket has been received and the team has been notified. A first response usually arrives within a few minutes.
          <s-button slot="secondary-actions" icon="refresh" loading={triageBusy || undefined} onClick={retryTriage}>
            Check for a response
          </s-button>
        </s-banner>
      )}

      <s-section heading="Conversation">
        <s-stack gap="base">
          {messages.length === 0 && <s-text color="subdued">No messages yet.</s-text>}
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} body={m.body} createdAt={m.createdAt} />
          ))}
          <replyFetcher.Form method="post" action="/api/support/ticket-action" ref={replyFormRef}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <input type="hidden" name="intent" value="reply" />
            <s-stack gap="small-100">
              <s-text-area
                label="Reply"
                labelAccessibilityVisibility="exclusive"
                name="body"
                rows={4}
                maxLength={5000}
                placeholder="Write a reply…"
                disabled={replyBusy || undefined}
                value={reply}
                onInput={(e) => setReply(e.currentTarget.value ?? '')}
              />
              <s-stack direction="inline" justifyContent="end">
                <s-button
                  variant="primary"
                  icon="send"
                  loading={replyBusy || undefined}
                  disabled={!reply.trim() || replyBusy || undefined}
                  onClick={sendReply}
                >
                  Send reply
                </s-button>
              </s-stack>
            </s-stack>
          </replyFetcher.Form>
        </s-stack>
      </s-section>
    </s-page>
  );
}

function StatusTracker({ status }: { status: string }) {
  const steps = statusSteps(status);
  const currentIdx = steps.findIndex((s) => s.key === status);
  return (
    <s-box padding="small-100" border="base" borderRadius="base" background="base">
      <s-stack direction="inline" gap="small-100" alignItems="center" accessibilityLabel="Ticket progress">
        {steps.map((step, i) => (
          <Fragment key={step.key}>
            {i === currentIdx ? (
              <s-badge tone={TICKET_STATUS_TONE[step.key] ?? 'neutral'}>{step.label}</s-badge>
            ) : i < currentIdx ? (
              // Done: check icon + weight carry the state, not color alone.
              <s-stack direction="inline" gap="small-300" alignItems="center">
                <s-icon type="check" size="small" tone="neutral" />
                <s-text type="strong" color="subdued">{step.label}</s-text>
              </s-stack>
            ) : (
              <s-text color="subdued">{step.label}</s-text>
            )}
            {i < steps.length - 1 && <s-icon type="chevron-right" size="small" tone="neutral" />}
          </Fragment>
        ))}
      </s-stack>
    </s-box>
  );
}

function MessageBubble({ role, body, createdAt }: { role: string; body: string; createdAt: string }) {
  if (role === 'system') {
    return (
      <s-stack alignItems="center">
        <s-text color="subdued">{body} · {timeAgo(createdAt)}</s-text>
      </s-stack>
    );
  }

  const mine = role === 'merchant';
  return (
    <s-stack gap="small-300" alignItems={mine ? 'end' : 'start'}>
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-text type="strong" color="subdued">{ROLE_LABEL[role] ?? titleCase(role)}</s-text>
        <s-text color="subdued">{timeAgo(createdAt)}</s-text>
      </s-stack>
      <s-box
        padding="small-100"
        background={mine ? 'subdued' : 'base'}
        border="base"
        borderRadius="base"
        maxInlineSize="78%"
      >
        <s-stack gap="small-300">
          {body.split(/\n+/).map((line, i) => (
            <s-text key={i}>{line}</s-text>
          ))}
        </s-stack>
      </s-box>
    </s-stack>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';

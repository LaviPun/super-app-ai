import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { shopify } from '~/shopify.server';
import { recordTicketEvent, type TicketEventType } from '~/services/support/ticket-events.server';
import { notifySupportEvent } from '~/services/support/notifications.server';
import { proposeTicketFix, applyFixProposal, rejectFixProposal } from '~/services/support/autofix.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  useAdminCtx,
  Icon,
  Btn,
  Badge,
  Card,
  Field,
  Input,
  Textarea,
  Toggle,
  Banner,
  Tabs,
  KV,
  PageHead,
  MonoChip,
  EmptyState,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';
import { MdLite } from '~/components/admin/md-lite';

const SEVERITY_TONE: Record<string, any> = { critical: 'critical', high: 'warning', medium: 'info', low: undefined };
const STATUS_TONE: Record<string, any> = { OPEN: 'info', AI_RESPONDED: 'success', ESCALATED: 'warning', RESOLVED: undefined };
const FIX_TONE: Record<string, any> = { PROPOSED: 'info', APPLIED: 'success', REJECTED: 'critical' };

// tl-dot tone per flow event type (falls back to 'info').
const EVENT_TONE: Record<string, string> = {
  CREATED: 'info',
  TRIAGED: 'success',
  TRIAGE_FAILED: 'critical',
  MERCHANT_REPLIED: 'info',
  AI_REPLIED: 'magic',
  HUMAN_REPLIED: 'info',
  NOTE_ADDED: 'info',
  ESCALATED: 'warning',
  INTERVENTION_FLAGGED: 'critical',
  INTERVENTION_CLEARED: 'success',
  STATUS_CHANGED: 'info',
  RESOLVED: 'success',
  REOPENED: 'warning',
  FIX_PROPOSED: 'magic',
  FIX_APPLIED: 'success',
  FIX_REJECTED: 'critical',
  NOTIFIED: 'info',
};
const EVENT_ICON: Record<string, string> = {
  CREATED: 'plus',
  TRIAGED: 'magic',
  TRIAGE_FAILED: 'bug',
  MERCHANT_REPLIED: 'chat',
  AI_REPLIED: 'magic',
  HUMAN_REPLIED: 'user',
  NOTE_ADDED: 'edit',
  ESCALATED: 'alert',
  INTERVENTION_FLAGGED: 'alert',
  INTERVENTION_CLEARED: 'check',
  STATUS_CHANGED: 'refresh',
  RESOLVED: 'check',
  REOPENED: 'refresh',
  FIX_PROPOSED: 'code',
  FIX_APPLIED: 'check',
  FIX_REJECTED: 'x',
  NOTIFIED: 'bell',
};

/** Pull provider/model out of the latest assistant message's triage envelope. */
function parseAssistantMeta(metaJson: string | null): { provider: string | null; model: string | null } {
  if (!metaJson) return { provider: null, model: null };
  try {
    const meta = JSON.parse(metaJson) as Record<string, unknown>;
    const provider = (meta.provider ?? meta.providerName ?? (meta.provider as any)?.name ?? null) as string | null;
    const model = (meta.model ?? (meta.provider as any)?.model ?? null) as string | null;
    return { provider: typeof provider === 'string' ? provider : null, model: typeof model === 'string' ? model : null };
  } catch {
    return { provider: null, model: null };
  }
}

export async function loader({ request, params }: { request: Request; params: { ticketId?: string } }) {
  await requireInternalAdmin(request);
  const ticketId = params.ticketId;
  if (!ticketId) throw new Response('Missing ticket', { status: 400 });

  const prisma = getPrisma();
  // Cross-shop — no shopId scoping. Full thread incl. internal notes.
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      shop: true,
      messages: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'desc' } },
      fixProposals: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!ticket) throw new Response('Ticket not found', { status: 404 });

  const lastAssistant = [...ticket.messages].reverse().find((m) => m.role === 'assistant' && m.metaJson);
  const aiMeta = parseAssistantMeta(lastAssistant?.metaJson ?? null);

  return json({
    ticket: {
      id: ticket.id,
      shopId: ticket.shopId,
      shopDomain: ticket.shop?.shopDomain ?? '—',
      subject: ticket.subject,
      description: ticket.description,
      moduleId: ticket.moduleId,
      status: ticket.status,
      source: ticket.source,
      shopperEmail: ticket.shopperEmail,
      needsIntervention: ticket.needsIntervention,
      assignee: ticket.assignee ?? '',
      aiSeverity: ticket.aiSeverity,
      aiCategory: ticket.aiCategory,
      aiSummary: ticket.aiSummary,
      aiConfidence: ticket.aiConfidence,
      aiEscalate: ticket.aiEscalate,
      aiTriageError: ticket.aiTriageError,
      triagedAt: ticket.triagedAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    },
    aiMeta,
    messages: ticket.messages.map((m) => ({
      id: m.id,
      role: m.role,
      body: m.body,
      internal: m.internal,
      createdAt: m.createdAt.toISOString(),
    })),
    events: ticket.events.map((e) => ({
      id: e.id,
      type: e.type,
      actor: e.actor,
      detailsJson: e.detailsJson,
      createdAt: e.createdAt.toISOString(),
    })),
    fixProposals: ticket.fixProposals.map((f) => ({
      id: f.id,
      status: f.status,
      explanation: f.explanation,
      moduleId: f.moduleId,
      recipeJson: f.recipeJson,
      validationJson: f.validationJson,
      appliedVersionId: f.appliedVersionId,
      createdAt: f.createdAt.toISOString(),
    })),
  });
}

export async function action({ request, params }: { request: Request; params: { ticketId?: string } }) {
  await requireInternalAdmin(request);
  const ticketId = params.ticketId;
  if (!ticketId) return json({ ok: false, message: 'Missing ticket' }, { status: 400 });

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const prisma = getPrisma();
  const activity = new ActivityLogService();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, shopId: true, status: true, subject: true, shop: { select: { shopDomain: true } } },
  });
  if (!ticket) return json({ ok: false, message: 'Ticket not found' }, { status: 404 });

  // Merchant email notifications need a shop-scoped Admin client (owner email is
  // fetched live). Best-effort: no offline session → notification silently skipped.
  const getShopAdminClient = async () => {
    try {
      const { admin } = await shopify.unauthenticated.admin(ticket.shop.shopDomain);
      return admin;
    } catch {
      return undefined;
    }
  };

  // Best-effort audit — never let the activity log break the mutation.
  const audit = (action: Parameters<ActivityLogService['log']>[0]['action'], details?: Record<string, unknown>) =>
    activity
      .log({ actor: 'INTERNAL_ADMIN', action, resource: `supportTicket:${ticketId}`, shopId: ticket.shopId, details })
      .catch(() => {});

  if (intent === 'reply') {
    const body = String(form.get('body') ?? '').trim();
    if (!body) return json({ ok: false, message: 'Reply cannot be empty' }, { status: 400 });
    // Status is intentionally left unchanged — an escalated ticket stays escalated.
    await prisma.supportTicketMessage.create({ data: { ticketId, role: 'human_agent', body, internal: false } });
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
    await recordTicketEvent(ticketId, 'HUMAN_REPLIED', 'INTERNAL_ADMIN');
    await audit('SUPPORT_TICKET_REPLIED');
    await notifySupportEvent('human_replied', ticket, { admin: await getShopAdminClient() });
    return json({ ok: true, message: 'Reply sent to merchant' });
  }

  if (intent === 'note') {
    const body = String(form.get('body') ?? '').trim();
    if (!body) return json({ ok: false, message: 'Note cannot be empty' }, { status: 400 });
    await prisma.supportTicketMessage.create({ data: { ticketId, role: 'human_agent', body, internal: true } });
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
    await recordTicketEvent(ticketId, 'NOTE_ADDED', 'INTERNAL_ADMIN');
    await audit('SUPPORT_NOTE_ADDED');
    return json({ ok: true, message: 'Internal note added' });
  }

  if (intent === 'set_intervention') {
    const value = String(form.get('value') ?? '') === 'true';
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { needsIntervention: value } });
    await recordTicketEvent(ticketId, value ? 'INTERVENTION_FLAGGED' : 'INTERVENTION_CLEARED', 'INTERNAL_ADMIN');
    await audit('SUPPORT_INTERVENTION_FLAGGED', { needsIntervention: value });
    return json({ ok: true, message: value ? 'Flagged for intervention' : 'Intervention cleared' });
  }

  if (intent === 'set_status') {
    const status = String(form.get('status') ?? '');
    const allowed = ['OPEN', 'ESCALATED', 'RESOLVED'];
    if (!allowed.includes(status)) return json({ ok: false, message: 'Invalid status' }, { status: 400 });
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
    // Prefer the specific lifecycle event when it matches; else generic STATUS_CHANGED.
    const evType: TicketEventType =
      status === 'RESOLVED' ? 'RESOLVED'
      : status === 'ESCALATED' ? 'ESCALATED'
      : ticket.status === 'RESOLVED' && status === 'OPEN' ? 'REOPENED'
      : 'STATUS_CHANGED';
    await recordTicketEvent(ticketId, evType, 'INTERNAL_ADMIN', { from: ticket.status, to: status });
    await audit('SUPPORT_TICKET_STATUS_CHANGED', { from: ticket.status, to: status });
    if (status === 'RESOLVED') await notifySupportEvent('resolved', ticket, { admin: await getShopAdminClient() });
    return json({ ok: true, message: 'Status changed to ' + titleCase(status) });
  }

  if (intent === 'assign') {
    const assignee = String(form.get('assignee') ?? '').trim();
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { assignee: assignee || null } });
    await recordTicketEvent(ticketId, 'STATUS_CHANGED', 'INTERNAL_ADMIN', { field: 'assignee', value: assignee || null });
    await audit('SUPPORT_TICKET_ASSIGNED', { assignee: assignee || null });
    return json({ ok: true, message: assignee ? 'Assigned to ' + assignee : 'Assignee cleared' });
  }

  if (intent === 'attempt_fix') {
    const result = await proposeTicketFix(ticketId);
    if (!result.ok) return json({ ok: false, message: result.error });
    await audit('SUPPORT_FIX_PROPOSED', { count: result.proposals });
    return json({
      ok: true,
      message: result.proposals === 1 ? '1 fix proposal generated' : `${result.proposals} fix proposals generated`,
    });
  }

  if (intent === 'apply_fix') {
    const proposalId = String(form.get('proposalId') ?? '').trim();
    if (!proposalId) return json({ ok: false, message: 'Missing proposal' }, { status: 400 });
    const result = await applyFixProposal(proposalId);
    if (!result.ok) return json({ ok: false, message: result.error });
    await audit('SUPPORT_FIX_APPLIED', { proposalId, versionId: result.versionId });
    return json({ ok: true, message: 'Fix applied as a new draft version' });
  }

  if (intent === 'reject_fix') {
    const proposalId = String(form.get('proposalId') ?? '').trim();
    if (!proposalId) return json({ ok: false, message: 'Missing proposal' }, { status: 400 });
    const result = await rejectFixProposal(proposalId);
    if (!result.ok) return json({ ok: false, message: result.error });
    await audit('SUPPORT_FIX_REJECTED', { proposalId });
    return json({ ok: true, message: 'Fix proposal rejected' });
  }

  return json({ ok: false, message: 'Unknown intent' }, { status: 400 });
}

type MessageRow = ReturnType<typeof useLoaderData<typeof loader>>['messages'][number];
type EventRow = ReturnType<typeof useLoaderData<typeof loader>>['events'][number];
type FixRow = ReturnType<typeof useLoaderData<typeof loader>>['fixProposals'][number];

/** Pretty-print a stored JSON string; fall back to the raw text if it won't parse. */
function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function ConversationMessage({ m }: { m: MessageRow }) {
  const roleLabel = titleCase(m.role.replace('_', ' '));
  return (
    <div className={'support-msg' + (m.internal ? ' support-msg-internal' : '')} style={m.internal ? { background: 'var(--p-warning-bg)', borderRadius: 8, padding: 12 } : { padding: 12 }}>
      <div className="row-2" style={{ marginBottom: 6 }}>
        <span className="t-sm t-strong">{roleLabel}</span>
        {m.internal && <Badge tone="warning">Internal note</Badge>}
        <span className="grow" />
        <span className="t-xs t-muted" title={new Date(m.createdAt).toLocaleString()}>{formatRelativeTime(m.createdAt)}</span>
      </div>
      <div className="t-sm asst-text" style={{ whiteSpace: 'pre-wrap' }}>
        <MdLite text={m.body} />
      </div>
    </div>
  );
}

function FlowEvent({ e }: { e: EventRow }) {
  const tone = EVENT_TONE[e.type] ?? 'info';
  const icon = EVENT_ICON[e.type] ?? 'info';
  let pretty: string | null = null;
  if (e.detailsJson) {
    try {
      pretty = JSON.stringify(JSON.parse(e.detailsJson), null, 2);
    } catch {
      pretty = e.detailsJson;
    }
  }
  return (
    <div className="tl-item">
      <span className={'tl-dot ' + tone} />
      <div className="row-2">
        <Icon name={icon} size={14} />
        <span className="t-sm t-strong">{titleCase(e.type.replace(/_/g, ' '))}</span>
        <Badge tone={e.actor === 'INTERNAL_ADMIN' ? 'warning' : e.actor === 'AI' ? 'magic' : undefined}>{titleCase(e.actor)}</Badge>
      </div>
      <div className="t-xs t-muted" title={new Date(e.createdAt).toLocaleString()}>{formatRelativeTime(e.createdAt)}</div>
      {pretty && (
        <details style={{ marginTop: 4 }}>
          <summary className="t-xs t-muted" style={{ cursor: 'pointer' }}>Details</summary>
          <pre className="t-mono t-xs" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{pretty}</pre>
        </details>
      )}
    </div>
  );
}

function FixProposalCard({
  f,
  onApply,
  onReject,
  busyProposalId,
  anyBusy,
}: {
  f: FixRow;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  busyProposalId: string | null;
  anyBusy: boolean;
}) {
  const isBusy = busyProposalId === f.id;
  return (
    <div className="stack" style={{ gap: 8, padding: 12, border: '1px solid var(--p-border)', borderRadius: 8 }}>
      <div className="row-2" style={{ alignItems: 'flex-start' }}>
        <Badge tone={FIX_TONE[f.status]}>{titleCase(f.status)}</Badge>
        <div className="stack" style={{ gap: 2, flex: 1 }}>
          <span className="t-sm t-strong">{f.explanation}</span>
          <span className="t-xs t-muted">
            Module <MonoChip>{f.moduleId}</MonoChip> · {formatRelativeTime(f.createdAt)}
          </span>
        </div>
      </div>

      {f.validationJson && (
        <details>
          <summary className="t-xs t-muted" style={{ cursor: 'pointer' }}>Validation summary</summary>
          <pre className="t-mono t-xs" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{prettyJson(f.validationJson)}</pre>
        </details>
      )}

      <details>
        <summary className="t-xs t-muted" style={{ cursor: 'pointer' }}>Proposed recipe JSON</summary>
        <pre className="t-mono t-xs" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', maxHeight: 320, overflow: 'auto' }}>{prettyJson(f.recipeJson)}</pre>
      </details>

      {f.status === 'PROPOSED' && (
        <div className="row-2" style={{ justifyContent: 'flex-end' }}>
          <Btn icon="x" disabled={anyBusy} loading={isBusy} onClick={() => onReject(f.id)}>Reject</Btn>
          <Btn variant="primary" icon="check" disabled={anyBusy} loading={isBusy} onClick={() => onApply(f.id)}>
            Approve &amp; apply
          </Btn>
        </div>
      )}

      {f.status === 'APPLIED' && f.appliedVersionId && (
        <div className="row-2 t-xs t-muted" style={{ flexWrap: 'wrap' }}>
          <span>Applied as draft</span>
          <MonoChip>{f.appliedVersionId}</MonoChip>
          <span>· Publishing stays manual — review and publish it from the module page.</span>
        </div>
      )}
    </div>
  );
}

export default function AdminSupportTicket() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const fetcher = useFetcher<typeof action>();
  const t = data.ticket;

  const [tab, setTab] = useState('conversation');
  const [assignee, setAssignee] = useState(t.assignee);
  const [composer, setComposer] = useState('');
  const [internalMode, setInternalMode] = useState(false);
  const busy = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      ctx.toast(fetcher.data.message, !fetcher.data.ok);
      // Clear the composer only after a successful reply/note.
      if (fetcher.data.ok && fetcher.data.message && /reply|note/i.test(fetcher.data.message)) setComposer('');
    }
  }, [fetcher.state, fetcher.data, ctx]);

  const submit = (fields: Record<string, string>) => fetcher.submit(fields, { method: 'post' });
  const submittingIntent = busy ? String(fetcher.formData?.get('intent') ?? '') : '';
  const busyProposalId = busy ? (fetcher.formData?.get('proposalId') as string | null) : null;
  const attemptFix = () => submit({ intent: 'attempt_fix' });
  const applyFix = (proposalId: string) => submit({ intent: 'apply_fix', proposalId });
  const rejectFix = (proposalId: string) => submit({ intent: 'reject_fix', proposalId });
  const saveAssignee = () => submit({ intent: 'assign', assignee });
  const toggleIntervention = () => submit({ intent: 'set_intervention', value: String(!t.needsIntervention) });
  const setStatus = (status: string) => submit({ intent: 'set_status', status });
  const send = () => {
    if (!composer.trim()) return;
    submit({ intent: internalMode ? 'note' : 'reply', body: composer });
  };

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/support', label: 'Support CRM' }}
        title={t.subject}
        badge={
          <span className="row-2">
            <Badge tone={STATUS_TONE[t.status]}>{titleCase(t.status)}</Badge>
            {t.aiSeverity && <Badge tone={SEVERITY_TONE[t.aiSeverity]}>{titleCase(t.aiSeverity)}</Badge>}
            {t.source === 'SHOPPER' && <Badge tone="magic">Shopper</Badge>}
          </span>
        }
        sub={
          <span className="row-2">
            <a className="cell-link" href="#" onClick={(e) => { e.preventDefault(); ctx.go('#/admin/stores/' + t.shopId); }}>
              <MonoChip>{t.shopDomain}</MonoChip>
            </a>
            {t.shopperEmail && <span className="t-xs t-muted">{t.shopperEmail}</span>}
          </span>
        }
        actions={
          <>
            <Btn icon="refresh" disabled={busy || t.status === 'OPEN'} onClick={() => setStatus('OPEN')}>
              {t.status === 'RESOLVED' ? 'Reopen' : 'Mark open'}
            </Btn>
            <Btn icon="alert" disabled={busy || t.status === 'ESCALATED'} onClick={() => setStatus('ESCALATED')}>
              Escalate
            </Btn>
            <Btn variant="primary" icon="check" disabled={busy || t.status === 'RESOLVED'} onClick={() => setStatus('RESOLVED')}>
              Resolve
            </Btn>
          </>
        }
      />

      {t.aiTriageError && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="critical" title="Triage failed">
            {t.aiTriageError}
          </Banner>
        </div>
      )}

      <div className="col-main" style={{ marginBottom: 16 }}>
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>Ticket controls</div>
          <div className="grid grid-2" style={{ gap: 16 }}>
            <Field label="Assignee" help="Who owns this ticket internally">
              <div className="row-2">
                <Input value={assignee} placeholder="Unassigned" onChange={(e: any) => setAssignee(e.target.value)} />
                <Btn loading={busy} onClick={saveAssignee}>Save</Btn>
              </div>
            </Field>
            <Field label="Needs intervention" help="Flag when a human must step in">
              <div className="row-2">
                <Toggle checked={t.needsIntervention} onChange={toggleIntervention} />
                <span className="t-sm t-muted">{t.needsIntervention ? 'Flagged' : 'Not flagged'}</span>
              </div>
            </Field>
          </div>
        </Card>

        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>AI workup</div>
          {t.triagedAt || t.aiSummary ? (
            <>
              <KV
                rows={[
                  ['Severity', t.aiSeverity ? <Badge key="sev" tone={SEVERITY_TONE[t.aiSeverity]}>{titleCase(t.aiSeverity)}</Badge> : '—'],
                  ['Category', t.aiCategory ?? '—'],
                  ['Confidence', t.aiConfidence != null ? Math.round(t.aiConfidence * 100) + '%' : '—'],
                  ['Escalate', t.aiEscalate == null ? '—' : t.aiEscalate ? 'Yes' : 'No'],
                  ['Provider', data.aiMeta.provider ?? '—'],
                  ['Model', data.aiMeta.model ?? '—'],
                  ['Triaged', t.triagedAt ? formatRelativeTime(t.triagedAt) : '—'],
                ]}
              />
              {t.aiSummary && (
                <div style={{ marginTop: 12 }}>
                  <div className="t-xs t-muted" style={{ marginBottom: 4 }}>Summary</div>
                  <div className="t-sm">{t.aiSummary}</div>
                </div>
              )}
            </>
          ) : (
            <div className="t-sm t-muted">This ticket has not been triaged yet.</div>
          )}
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'conversation', label: 'Conversation', badge: data.messages.length },
            { id: 'flow', label: 'Flow', badge: data.events.length },
            { id: 'fixes', label: 'Fixes', badge: data.fixProposals.length },
          ]}
        />
      </Card>

      {tab === 'conversation' && (
        <Card pad>
          {data.messages.length ? (
            <div className="stack-3">
              {data.messages.map((m) => (
                <ConversationMessage key={m.id} m={m} />
              ))}
            </div>
          ) : (
            <div className="t-sm t-muted">No messages on this ticket yet.</div>
          )}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--p-border)', paddingTop: 16 }}>
            <div className="row-2" style={{ marginBottom: 8 }}>
              <Toggle checked={internalMode} onChange={() => setInternalMode((v) => !v)} />
              <span className="t-sm">{internalMode ? 'Internal note (not shown to merchant)' : 'Reply to merchant'}</span>
            </div>
            <Textarea
              value={composer}
              rows={4}
              placeholder={internalMode ? 'Write an internal note…' : 'Write a reply to the merchant…'}
              onChange={(e: any) => setComposer(e.target.value)}
            />
            <div className="row-2" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
              <Btn variant="primary" icon="send" loading={busy} disabled={!composer.trim()} onClick={send}>
                {internalMode ? 'Add note' : 'Send reply'}
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {tab === 'flow' && (
        <Card pad>
          {data.events.length ? (
            <div className="timeline">
              {data.events.map((e) => (
                <FlowEvent key={e.id} e={e} />
              ))}
            </div>
          ) : (
            <EmptyState icon="clock" title="No events yet">
              Lifecycle events — triage, replies, status changes — appear here as the ticket progresses.
            </EmptyState>
          )}
        </Card>
      )}

      {tab === 'fixes' && (
        <Card pad>
          {t.moduleId ? (
            <>
              <div className="row-2" style={{ marginBottom: 16, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="stack" style={{ gap: 2 }}>
                  <span className="t-sm t-strong">AI auto-fix</span>
                  <span className="t-xs t-muted">
                    Generate corrected module recipes for this ticket. Applying creates a new draft version — publishing stays manual.
                  </span>
                </div>
                <Btn
                  variant="primary"
                  icon="magic"
                  disabled={busy}
                  loading={submittingIntent === 'attempt_fix'}
                  onClick={attemptFix}
                >
                  {submittingIntent === 'attempt_fix' ? 'Generating fix…' : 'Attempt AI fix'}
                </Btn>
              </div>
              {data.fixProposals.length ? (
                <div className="stack-3">
                  {data.fixProposals.map((f) => (
                    <FixProposalCard
                      key={f.id}
                      f={f}
                      onApply={applyFix}
                      onReject={rejectFix}
                      busyProposalId={busyProposalId}
                      anyBusy={busy}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon="code" title="No fix proposals yet">
                  Use “Attempt AI fix” to have the AI propose a corrected version of this module. Each proposal can be reviewed, then approved or rejected.
                </EmptyState>
              )}
            </>
          ) : (
            <EmptyState icon="code" title="No module linked">
              This ticket isn’t linked to a module, so the AI has nothing to fix. Link a module to the ticket to enable AI auto-fix.
            </EmptyState>
          )}
        </Card>
      )}
    </div>
  );
}

import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { AppError } from '~/services/errors/app-error.server';
import { runSupportTriage } from '~/services/support/triage.server';
import { recordTicketEvent } from '~/services/support/ticket-events.server';
import { notifySupportEvent } from '~/services/support/notifications.server';

const MAX_REPLY = 5_000;
const INTENTS = ['reply', 'escalate', 'resolve', 'reopen', 'retry_triage'] as const;
type Intent = (typeof INTENTS)[number];

const INTENT_ACTION = {
  reply: 'SUPPORT_TICKET_REPLY',
  escalate: 'SUPPORT_TICKET_ESCALATE',
  resolve: 'SUPPORT_TICKET_RESOLVE',
  reopen: 'SUPPORT_TICKET_REOPEN',
  retry_triage: 'SUPPORT_TICKET_RETRY_TRIAGE',
} as const satisfies Record<Intent, string>;

export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { session } = await shopify.authenticate.admin(request);

  try {
    await enforceRateLimit(`support-action:${session.shop}`);
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      const retryAfterSec = Number(err.details?.retryAfterSec ?? 60);
      return json({ error: err.message }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } });
    }
    throw err;
  }

  const form = await request.formData();
  const ticketId = String(form.get('ticketId') ?? '').trim();
  const intent = String(form.get('intent') ?? '').trim() as Intent;

  if (!ticketId) return json({ error: 'Missing ticketId' }, { status: 400 });
  if (!INTENTS.includes(intent)) return json({ error: 'Unknown intent' }, { status: 400 });

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, shopId: shopRow.id } });
  if (!ticket) return json({ error: 'Ticket not found' }, { status: 404 });

  if (intent === 'reply') {
    const body = String(form.get('body') ?? '').trim();
    if (!body) return json({ error: 'Reply body is required' }, { status: 400 });
    if (body.length > MAX_REPLY) return json({ error: `Reply must be under ${MAX_REPLY} characters` }, { status: 400 });
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        // a merchant reply reopens a resolved ticket
        status: ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status,
        messages: { create: { role: 'merchant', body } },
      },
    });
    await recordTicketEvent(ticket.id, 'MERCHANT_REPLIED', 'MERCHANT');
    if (ticket.status === 'RESOLVED') await recordTicketEvent(ticket.id, 'REOPENED', 'MERCHANT', { via: 'reply' });
  } else if (intent === 'escalate') {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'ESCALATED',
        aiEscalate: true,
        messages: {
          create: { role: 'system', body: 'Merchant requested human review. A teammate will pick this up with the AI workup attached.' },
        },
      },
    });
    await recordTicketEvent(ticket.id, 'ESCALATED', 'MERCHANT');
    // Best-effort operator alert; never blocks the escalation.
    await notifySupportEvent('escalated', ticket, {
      shopDomain: session.shop,
      reason: 'merchant requested human review',
    });
  } else if (intent === 'resolve') {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'RESOLVED',
        messages: { create: { role: 'system', body: 'Ticket marked as resolved.' } },
      },
    });
    await recordTicketEvent(ticket.id, 'RESOLVED', 'MERCHANT');
  } else if (intent === 'reopen') {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'OPEN',
        messages: { create: { role: 'system', body: 'Ticket reopened.' } },
      },
    });
    await recordTicketEvent(ticket.id, 'REOPENED', 'MERCHANT');
  } else if (intent === 'retry_triage') {
    const triage = await runSupportTriage(
      { subject: ticket.subject, description: ticket.description, shopDomain: session.shop },
      { shopId: shopRow.id },
    );
    if (!triage.ok) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { aiTriageError: triage.error },
      });
      await recordTicketEvent(ticket.id, 'TRIAGE_FAILED', 'SYSTEM', { error: triage.error, provider: triage.provider, retry: true });
      return json({ error: `Triage failed: ${triage.error}` }, { status: 503 });
    }
    const { result } = triage;
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: result.escalate ? 'ESCALATED' : 'AI_RESPONDED',
        aiSeverity: result.severity,
        aiCategory: result.category,
        aiSummary: result.summary,
        aiConfidence: result.confidence,
        aiEscalate: result.escalate,
        aiTriageError: null,
        triagedAt: new Date(),
        messages: {
          create: {
            role: 'assistant',
            body: result.suggestedReply,
            metaJson: JSON.stringify({ ...result, provider: triage.provider, model: triage.model }),
          },
        },
      },
    });
    await recordTicketEvent(ticket.id, 'TRIAGED', 'AI', {
      severity: result.severity, category: result.category, confidence: result.confidence,
      escalate: result.escalate, provider: triage.provider, model: triage.model, retry: true,
    });
    await recordTicketEvent(ticket.id, 'AI_REPLIED', 'AI');
    if (result.escalate) {
      await recordTicketEvent(ticket.id, 'ESCALATED', 'AI', { reason: 'triage recommended escalation' });
      await notifySupportEvent('escalated', ticket, {
        shopDomain: session.shop,
        severity: result.severity,
        summary: result.summary,
        reason: 'triage recommended escalation',
      });
    }
  }

  const activity = new ActivityLogService();
  await activity
    .log({
      actor: 'MERCHANT',
      action: INTENT_ACTION[intent],
      resource: `/support/${ticket.id}`,
      shopId: shopRow.id,
      details: { subject: ticket.subject.slice(0, 120) },
    })
    .catch(() => {});

  return json({ ok: true });
}

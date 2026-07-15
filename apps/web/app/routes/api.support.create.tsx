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

const MAX_SUBJECT = 200;
const MAX_DESCRIPTION = 5_000;

export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { session } = await shopify.authenticate.admin(request);

  try {
    await enforceRateLimit(`support-create:${session.shop}`);
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      const retryAfterSec = Number(err.details?.retryAfterSec ?? 60);
      return json({ error: err.message }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } });
    }
    throw err;
  }

  const form = await request.formData();
  const subject = String(form.get('subject') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const moduleId = String(form.get('moduleId') ?? '').trim() || null;

  if (!subject) return json({ error: 'Subject is required' }, { status: 400 });
  if (!description) return json({ error: 'Description is required' }, { status: 400 });
  if (subject.length > MAX_SUBJECT) return json({ error: `Subject must be under ${MAX_SUBJECT} characters` }, { status: 400 });
  if (description.length > MAX_DESCRIPTION) {
    return json({ error: `Description must be under ${MAX_DESCRIPTION} characters` }, { status: 400 });
  }

  const prisma = getPrisma();
  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
    });
  }

  let moduleContext: string | undefined;
  if (moduleId) {
    const module = await prisma.module.findFirst({
      where: { id: moduleId, shopId: shopRow.id },
      select: { name: true, type: true, status: true },
    });
    if (!module) return json({ error: 'Unknown module' }, { status: 400 });
    moduleContext = `${module.name} (type: ${module.type}, status: ${module.status})`;
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      shopId: shopRow.id,
      subject,
      description,
      moduleId,
      messages: { create: { role: 'merchant', body: description } },
    },
  });

  await recordTicketEvent(ticket.id, 'CREATED', 'MERCHANT', { subject: subject.slice(0, 120), moduleId });

  // Triage is best-effort: the ticket exists regardless of the model's health.
  const triage = await runSupportTriage(
    { subject, description, shopDomain: session.shop, moduleContext },
    { shopId: shopRow.id },
  );

  if (triage.ok) {
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
      escalate: result.escalate, provider: triage.provider, model: triage.model,
    });
    await recordTicketEvent(ticket.id, 'AI_REPLIED', 'AI');
    if (result.escalate) {
      await recordTicketEvent(ticket.id, 'ESCALATED', 'AI', { reason: 'triage recommended escalation' });
      // Best-effort operator alert; never blocks ticket creation.
      await notifySupportEvent('escalated', ticket, {
        shopDomain: session.shop,
        severity: result.severity,
        summary: result.summary,
        reason: 'triage recommended escalation',
      });
    }
  } else {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { aiTriageError: triage.error },
    });
    await recordTicketEvent(ticket.id, 'TRIAGE_FAILED', 'SYSTEM', { error: triage.error, provider: triage.provider });
    await notifySupportEvent('triage_failed', ticket, {
      shopDomain: session.shop,
      reason: triage.error,
    });
  }

  const activity = new ActivityLogService();
  await activity
    .log({
      actor: 'MERCHANT',
      action: 'SUPPORT_TICKET_CREATED',
      resource: `/support/${ticket.id}`,
      shopId: shopRow.id,
      details: {
        subject: subject.slice(0, 120),
        triage: triage.ok ? { severity: triage.result.severity, escalate: triage.result.escalate } : { error: triage.error },
      },
    })
    .catch(() => {});

  return json({ ok: true, ticketId: ticket.id, triaged: triage.ok });
}

import { getPrisma } from '~/db.server';
import { runSupportTriage } from '~/services/support/triage.server';
import { recordTicketEvent } from '~/services/support/ticket-events.server';
import { notifySupportEvent } from '~/services/support/notifications.server';

/**
 * WS-G Task 20: the worker-side executor for `SUPPORT_TRIAGE_RUN`. Moved
 * verbatim from api.support.create.tsx's former inline block (post-ticket-
 * creation triage + ticket update + event recording + notification) so
 * ticket creation can return to the merchant immediately instead of
 * blocking on the triage model call.
 */
export async function runSupportTriageJob(ticketId: string): Promise<{ triaged: boolean }> {
  const prisma = getPrisma();
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { shop: true },
  });
  if (!ticket) throw new Error(`SupportTicket ${ticketId} not found — cannot triage`);

  let moduleContext: string | undefined;
  if (ticket.moduleId) {
    const module = await prisma.module.findFirst({
      where: { id: ticket.moduleId, shopId: ticket.shopId },
      select: { name: true, type: true, status: true },
    });
    if (module) moduleContext = `${module.name} (type: ${module.type}, status: ${module.status})`;
  }

  // Triage is best-effort: the ticket exists regardless of the model's health.
  const triage = await runSupportTriage(
    { subject: ticket.subject, description: ticket.description, shopDomain: ticket.shop.shopDomain, moduleContext },
    { shopId: ticket.shopId },
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
      // Best-effort operator alert; never blocks the job.
      await notifySupportEvent('escalated', ticket, {
        shopDomain: ticket.shop.shopDomain,
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
      shopDomain: ticket.shop.shopDomain,
      reason: triage.error,
    });
  }

  return { triaged: triage.ok };
}

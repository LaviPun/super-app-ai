import { getPrisma } from '~/db.server';

export type TicketEventType =
  | 'CREATED'
  | 'TRIAGED'
  | 'TRIAGE_FAILED'
  | 'MERCHANT_REPLIED'
  | 'AI_REPLIED'
  | 'HUMAN_REPLIED'
  | 'NOTE_ADDED'
  | 'ESCALATED'
  | 'INTERVENTION_FLAGGED'
  | 'INTERVENTION_CLEARED'
  | 'STATUS_CHANGED'
  | 'RESOLVED'
  | 'REOPENED'
  | 'FIX_PROPOSED'
  | 'FIX_APPLIED'
  | 'FIX_REJECTED'
  | 'NOTIFIED';

export type TicketEventActor = 'MERCHANT' | 'SHOPPER' | 'AI' | 'INTERNAL_ADMIN' | 'SYSTEM';

/**
 * Appends to the ticket's permanent flow record. Best-effort by design: the
 * record must never break the mutation it documents, so failures are logged
 * and swallowed.
 */
export async function recordTicketEvent(
  ticketId: string,
  type: TicketEventType,
  actor: TicketEventActor,
  details?: unknown,
): Promise<void> {
  try {
    const prisma = getPrisma();
    await prisma.supportTicketEvent.create({
      data: {
        ticketId,
        type,
        actor,
        detailsJson: details === undefined ? null : JSON.stringify(details),
      },
    });
  } catch (error) {
    console.error('[support] failed to record ticket event', { ticketId, type, error });
  }
}

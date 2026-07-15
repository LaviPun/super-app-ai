import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { recordTicketEvent } from '~/services/support/ticket-events.server';
import { runSupportTriage } from '~/services/support/triage.server';

const MAX_SUBJECT = 200;
const MAX_DESCRIPTION = 5_000;

const DEFAULT_SUBJECT = 'Support request from storefront';

export interface ShopperIntakeInput {
  shopId: string;
  moduleId: string;
  captureId: string;
  payload: Record<string, unknown>;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

/** Payload shapes vary by module; dig one level into a nested `contact` object. */
function nestedContact(payload: Record<string, unknown>): Record<string, unknown> {
  const contact = payload.contact;
  return contact && typeof contact === 'object' && !Array.isArray(contact)
    ? (contact as Record<string, unknown>)
    : {};
}

interface ExtractedIntake {
  subject: string;
  description: string;
  shopperEmail: string | null;
}

export function extractIntakeFields(payload: Record<string, unknown>): ExtractedIntake {
  const contact = nestedContact(payload);

  const subject =
    firstString(payload.subject, payload.topic, contact.subject)?.slice(0, MAX_SUBJECT) ?? DEFAULT_SUBJECT;

  const description =
    firstString(payload.message, payload.body, payload.description, contact.message)?.slice(0, MAX_DESCRIPTION) ??
    safeStringify(payload).slice(0, MAX_DESCRIPTION);

  const shopperEmail = firstString(payload.email, contact.email) ?? null;

  return { subject, description, shopperEmail };
}

function safeStringify(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

/**
 * Bridges a shopper-facing `support_ticket` capture into the merchant support
 * inbox: creates a SHOPPER-sourced SupportTicket and runs triage.
 *
 * Contract for the caller (ModuleCaptureService):
 *  - The whole thing is NON-FATAL — a bridge failure must never break the capture
 *    that funds it, so everything is wrapped and logged.
 *  - Ticket creation is awaited so the storefront POST leaves a durable record,
 *    but triage runs FIRE-AND-FORGET (the proxy request is shopper-facing and must
 *    stay well under the app-proxy/tunnel timeout — triage on the local model can
 *    take tens of seconds).
 */
export async function bridgeShopperSupportCapture(input: ShopperIntakeInput): Promise<void> {
  try {
    const prisma = getPrisma();
    const { subject, description, shopperEmail } = extractIntakeFields(input.payload);

    const shop = await prisma.shop.findUnique({
      where: { id: input.shopId },
      select: { shopDomain: true },
    });
    const shopDomain = shop?.shopDomain ?? '';

    const ticket = await prisma.supportTicket.create({
      data: {
        shopId: input.shopId,
        source: 'SHOPPER',
        shopperEmail,
        subject,
        description,
        // The shopper's own words seed the thread as the opening `merchant`-role
        // message: the merchant detail view renders merchant-role bodies as the
        // customer-visible side of the conversation. `source: 'shopper'` on the
        // message meta records who actually wrote it (known labeling trade-off).
        messages: {
          create: {
            role: 'merchant',
            body: description,
            metaJson: JSON.stringify({ source: 'shopper', captureId: input.captureId }),
          },
        },
      },
      select: { id: true },
    });

    await recordTicketEvent(ticket.id, 'CREATED', 'SHOPPER', {
      captureId: input.captureId,
      moduleId: input.moduleId,
    });

    // Fire-and-forget: keep the storefront POST fast. Failures are self-contained.
    void triageShopperTicket({
      ticketId: ticket.id,
      shopId: input.shopId,
      shopDomain,
      moduleId: input.moduleId,
      subject,
      description,
    }).catch((error) => {
      console.error('[support] shopper triage task failed', { ticketId: ticket.id, error });
    });

    const activity = new ActivityLogService();
    await activity
      .log({
        actor: 'SYSTEM',
        action: 'SUPPORT_TICKET_SHOPPER_CREATED',
        resource: `/support/${ticket.id}`,
        shopId: input.shopId,
        details: {
          subject: subject.slice(0, 120),
          captureId: input.captureId,
          moduleId: input.moduleId,
          hasEmail: Boolean(shopperEmail),
        },
      })
      .catch(() => {});
  } catch (error) {
    console.error('[support] failed to bridge shopper capture into a ticket', {
      shopId: input.shopId,
      captureId: input.captureId,
      error,
    });
  }
}

interface TriageTaskInput {
  ticketId: string;
  shopId: string;
  shopDomain: string;
  moduleId: string;
  subject: string;
  description: string;
}

/**
 * Best-effort triage for a shopper ticket. Mirrors the persistence shape used by
 * api.support.create so shopper- and merchant-sourced tickets triage identically.
 * `runSupportTriage` never throws; this only persists the outcome.
 */
async function triageShopperTicket(input: TriageTaskInput): Promise<void> {
  const prisma = getPrisma();

  let moduleContext: string | undefined;
  try {
    const module = await prisma.module.findFirst({
      where: { id: input.moduleId, shopId: input.shopId },
      select: { name: true, type: true, status: true },
    });
    if (module) moduleContext = `${module.name} (type: ${module.type}, status: ${module.status})`;
  } catch {
    // Module context is a nicety, not a requirement — triage runs without it.
  }

  const triage = await runSupportTriage(
    { subject: input.subject, description: input.description, shopDomain: input.shopDomain, moduleContext },
    { shopId: input.shopId },
  );

  if (triage.ok) {
    const { result } = triage;
    await prisma.supportTicket.update({
      where: { id: input.ticketId },
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
    await recordTicketEvent(input.ticketId, 'TRIAGED', 'AI', {
      severity: result.severity,
      category: result.category,
      confidence: result.confidence,
      escalate: result.escalate,
      provider: triage.provider,
      model: triage.model,
    });
    await recordTicketEvent(input.ticketId, 'AI_REPLIED', 'AI');
    if (result.escalate) {
      await recordTicketEvent(input.ticketId, 'ESCALATED', 'AI', { reason: 'triage recommended escalation' });
    }
  } else {
    await prisma.supportTicket.update({
      where: { id: input.ticketId },
      data: { aiTriageError: triage.error },
    });
    await recordTicketEvent(input.ticketId, 'TRIAGE_FAILED', 'SYSTEM', {
      error: triage.error,
      provider: triage.provider,
    });
  }
}

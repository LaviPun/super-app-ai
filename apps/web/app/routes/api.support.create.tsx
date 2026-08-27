import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { sealAccessToken } from '~/services/shops/access-token.server';
import { AppError } from '~/services/errors/app-error.server';
import { recordTicketEvent } from '~/services/support/ticket-events.server';
import { enqueueOwnedJob } from '~/services/jobs/ops-queue.server';
import { OpsAlertService } from '~/services/observability/ops-alert.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

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
      data: { shopDomain: session.shop, accessToken: sealAccessToken(session.accessToken ?? ''), planTier: 'FREE' },
    });
  }

  if (moduleId) {
    // Validate the reference at request time; moduleContext itself is
    // recomputed from the ticket row inside support-triage-job.server.ts
    // once the worker actually runs triage.
    const module = await prisma.module.findFirst({
      where: { id: moduleId, shopId: shopRow.id },
      select: { id: true },
    });
    if (!module) return json({ error: 'Unknown module' }, { status: 400 });
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

  // WS-G Task 20: triage moved off the merchant-facing request path — the
  // ticket is returned immediately (status stays OPEN, matching today's
  // pre-triage state) and the worker's SUPPORT_TRIAGE_RUN executor
  // (support-triage-job.server.ts) does the ticket update / event recording
  // / notification that used to run inline here.
  //
  // Fix round (Important #4): the ticket row is already committed above — an
  // enqueue failure (e.g. Redis unreachable) must never throw into a 500
  // here, or the merchant would see "failed to create ticket" for a ticket
  // that DOES exist. Recorded loudly instead (ErrorLog-equivalent: ticket
  // event + aiTriageError + an ops alert), same pattern the triage-failure
  // branch itself already uses when the model call fails.
  try {
    await enqueueOwnedJob({ type: 'SUPPORT_TRIAGE_RUN', shopId: shopRow.id, payload: { ticketId: ticket.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[api.support.create] SUPPORT_TRIAGE_RUN enqueue failed — ticket created, triage will not run automatically', {
      ticketId: ticket.id,
      shopDomain: session.shop,
      ...safeErrorMeta(err),
    });
    await prisma.supportTicket
      .update({ where: { id: ticket.id }, data: { aiTriageError: `Triage could not be scheduled: ${message}`.slice(0, 500) } })
      .catch(() => {});
    await recordTicketEvent(ticket.id, 'TRIAGE_FAILED', 'SYSTEM', { error: message, reason: 'enqueue failed' });
    await new OpsAlertService()
      .fire({
        kind: 'TRIAGE_FAILED',
        message: `SUPPORT_TRIAGE_RUN enqueue failed for ticket ${ticket.id}`,
        error: err,
        context: { shopDomain: session.shop, ticketId: ticket.id },
      })
      .catch(() => {});
  }

  const activity = new ActivityLogService();
  await activity
    .log({
      actor: 'MERCHANT',
      action: 'SUPPORT_TICKET_CREATED',
      resource: `/support/${ticket.id}`,
      shopId: shopRow.id,
      details: { subject: subject.slice(0, 120) },
    })
    .catch(() => {});

  return json({ ok: true, ticketId: ticket.id, triaged: false });
}

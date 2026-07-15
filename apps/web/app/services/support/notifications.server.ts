/**
 * Support-event email notifications (Phase F).
 *
 * Two audiences:
 *  - Admin alerts (escalated | intervention_flagged | triage_failed |
 *    shopper_ticket_created): emailed to the operator recipients configured in
 *    AppSettings (enableEmailAlerts + alertRecipients), gated off by default.
 *  - Merchant updates (human_replied | resolved): emailed to the shop owner,
 *    whose address is fetched live from the Shopify Admin API — so it needs an
 *    Admin GraphQL client and is silently skipped when one isn't available.
 *
 * Contract: never throws, never blocks the caller. Best-effort — a failed or
 * unconfigured send is recorded and swallowed. Every attempted send is written
 * to the ticket flow record (NOTIFIED) with the recipient reduced to its domain.
 */

import { getPrisma } from '~/db.server';
import { sendEmail } from '~/services/notifications/mailer.server';
import { recordTicketEvent } from '~/services/support/ticket-events.server';
import { ActivityLogService } from '~/services/activity/activity.service';

export type SupportNotificationKind =
  | 'escalated'
  | 'intervention_flagged'
  | 'triage_failed'
  | 'shopper_ticket_created'
  | 'human_replied'
  | 'resolved';

const ADMIN_ALERT_KINDS: ReadonlySet<SupportNotificationKind> = new Set([
  'escalated',
  'intervention_flagged',
  'triage_failed',
  'shopper_ticket_created',
]);

/** Minimal ticket shape the notifier needs. Compatible with a Prisma SupportTicket row. */
export interface NotifiableTicket {
  id: string;
  subject: string;
  shopId?: string | null;
  aiSeverity?: string | null;
  aiSummary?: string | null;
}

/** Structural type for the Remix Shopify Admin GraphQL client (admin.graphql).
 * `options: any` (not `unknown`) so the real, more strictly-typed client stays
 * assignable — a parameter typed `unknown` rejects narrower signatures. */
export interface AdminGraphqlClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphql: (query: string, options?: any) => Promise<{ json: () => Promise<unknown> }>;
}

export interface NotifyExtra {
  /** Shop domain for the alert body; looked up from ticket.shopId when omitted. */
  shopDomain?: string;
  /** Severity/summary override (e.g. fresh triage output not yet on the ticket row). */
  severity?: string | null;
  summary?: string | null;
  /** Short reason line for triage_failed / intervention_flagged. */
  reason?: string | null;
  /** Admin GraphQL client — required for merchant kinds to resolve the owner email. */
  admin?: AdminGraphqlClient;
}

const KIND_TITLE: Record<SupportNotificationKind, string> = {
  escalated: 'Ticket escalated',
  intervention_flagged: 'Ticket flagged for intervention',
  triage_failed: 'Triage failed',
  shopper_ticket_created: 'New shopper ticket',
  human_replied: 'Support replied',
  resolved: 'Ticket resolved',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Reduce an email address to its domain so recipient PII never lands in the flow record. */
function redactToDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : 'redacted';
}

function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.includes('@'));
}

function internalTicketLink(ticketId: string): string {
  const base = process.env.APP_URL?.trim().replace(/\/+$/, '') ?? '';
  return `${base}/internal/support/${ticketId}`;
}

/**
 * Record the attempt on the ticket flow record and, on success, an ActivityLog
 * row. Both are best-effort; recipients are redacted to domain-only.
 */
async function recordAttempt(
  ticket: NotifiableTicket,
  kind: SupportNotificationKind,
  sent: boolean,
  recipients: string[],
): Promise<void> {
  const to = recipients.map(redactToDomain);
  await recordTicketEvent(ticket.id, 'NOTIFIED', 'SYSTEM', { kind, sent, to });
  if (sent) {
    await new ActivityLogService()
      .log({
        actor: 'SYSTEM',
        action: 'SUPPORT_NOTIFICATION_SENT',
        resource: `/internal/support/${ticket.id}`,
        shopId: ticket.shopId ?? undefined,
        details: { kind, to },
      })
      .catch(() => {});
  }
}

async function resolveShopDomain(ticket: NotifiableTicket, extra: NotifyExtra): Promise<string> {
  if (extra.shopDomain) return extra.shopDomain;
  if (!ticket.shopId) return 'unknown shop';
  try {
    const shop = await getPrisma().shop.findUnique({
      where: { id: ticket.shopId },
      select: { shopDomain: true },
    });
    return shop?.shopDomain ?? 'unknown shop';
  } catch {
    return 'unknown shop';
  }
}

async function notifyAdmins(
  ticket: NotifiableTicket,
  kind: SupportNotificationKind,
  extra: NotifyExtra,
): Promise<{ sent: boolean }> {
  let settings: { enableEmailAlerts: boolean; alertRecipients: string | null } | null = null;
  try {
    settings = await getPrisma().appSettings.findUnique({
      where: { id: 'singleton' },
      select: { enableEmailAlerts: true, alertRecipients: true },
    });
  } catch {
    settings = null;
  }

  const recipients = parseRecipients(settings?.alertRecipients);
  if (!settings?.enableEmailAlerts || recipients.length === 0) {
    // Alerts disabled or no recipients — not an attempt, nothing to record.
    return { sent: false };
  }

  const shopDomain = await resolveShopDomain(ticket, extra);
  const severity = extra.severity ?? ticket.aiSeverity ?? null;
  const summary = extra.summary ?? ticket.aiSummary ?? null;
  const title = KIND_TITLE[kind];
  const subject = `[SuperApp Support] ${title}: ${ticket.subject}`.slice(0, 200);
  const link = internalTicketLink(ticket.id);

  const rows: string[] = [
    `<p><strong>${escapeHtml(title)}</strong></p>`,
    `<p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>`,
    `<p><strong>Shop:</strong> ${escapeHtml(shopDomain)}</p>`,
  ];
  if (severity) rows.push(`<p><strong>Severity:</strong> ${escapeHtml(severity)}</p>`);
  if (extra.reason) rows.push(`<p><strong>Reason:</strong> ${escapeHtml(extra.reason)}</p>`);
  if (summary) rows.push(`<p><strong>Summary:</strong> ${escapeHtml(summary)}</p>`);
  rows.push(`<p><a href="${escapeHtml(link)}">Open ticket</a> (${escapeHtml(link)})</p>`);

  const textLines = [
    `${title}: ${ticket.subject}`,
    `Shop: ${shopDomain}`,
    severity ? `Severity: ${severity}` : null,
    extra.reason ? `Reason: ${extra.reason}` : null,
    summary ? `Summary: ${summary}` : null,
    `Open ticket: ${link}`,
  ].filter(Boolean) as string[];

  const result = await sendEmail({
    to: recipients,
    subject,
    html: rows.join('\n'),
    text: textLines.join('\n'),
  });
  await recordAttempt(ticket, kind, result.sent, recipients);
  return { sent: result.sent };
}

async function fetchShopOwnerEmail(admin: AdminGraphqlClient): Promise<string | null> {
  try {
    const response = await admin.graphql('#graphql\n      query SupportNotifyShopEmail { shop { email } }\n    ');
    const body = (await response.json()) as { data?: { shop?: { email?: string | null } } };
    const email = body?.data?.shop?.email;
    return typeof email === 'string' && email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

async function notifyMerchant(
  ticket: NotifiableTicket,
  kind: 'human_replied' | 'resolved',
  extra: NotifyExtra,
): Promise<{ sent: boolean }> {
  if (!extra.admin) return { sent: false };
  const ownerEmail = await fetchShopOwnerEmail(extra.admin);
  if (!ownerEmail) return { sent: false };

  const action = kind === 'human_replied' ? 'got a reply' : 'was resolved';
  const subject = `[SuperApp Support] Your ticket ${action}: ${ticket.subject}`.slice(0, 200);
  const html = [
    `<p>Your support ticket <strong>${escapeHtml(ticket.subject)}</strong> ${escapeHtml(action)}.</p>`,
    `<p>View it in the app under <strong>Support</strong>.</p>`,
  ].join('\n');
  const text = `Your support ticket "${ticket.subject}" ${action}.\nView it in the app under Support.`;

  const result = await sendEmail({ to: ownerEmail, subject, html, text });
  await recordAttempt(ticket, kind, result.sent, [ownerEmail]);
  return { sent: result.sent };
}

/**
 * Fire a support-event notification. Routes to the admin-alert or merchant path
 * by kind. Never throws; returns whether an email was actually sent.
 */
export async function notifySupportEvent(
  kind: SupportNotificationKind,
  ticket: NotifiableTicket,
  extra: NotifyExtra = {},
): Promise<{ sent: boolean }> {
  try {
    if (ADMIN_ALERT_KINDS.has(kind)) {
      return await notifyAdmins(ticket, kind, extra);
    }
    return await notifyMerchant(ticket, kind as 'human_replied' | 'resolved', extra);
  } catch (error) {
    console.error('[support] notifySupportEvent failed', { kind, ticketId: ticket.id, error });
    return { sent: false };
  }
}

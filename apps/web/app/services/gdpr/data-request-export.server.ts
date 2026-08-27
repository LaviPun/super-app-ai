/**
 * GDPR customers/data_request: compile + deliver the customer's data.
 *
 * Shopify's customers/data_request compliance webhook requires the app to
 * provide the requested customer's data to the store owner (who then fulfils
 * the customer's request). This module does the two things the original
 * handler never did:
 *
 *   1. compileCustomerDataExport — query every model in this schema that
 *      carries customer-scoped data, filtered by BOTH shopId and the
 *      customer identifier (fixing the historical no-op filter bug), and
 *      assemble a structured JSON export.
 *   2. deliverCustomerDataExport — email that export to the shop's owner
 *      (resolved live via the Admin API, same pattern as
 *      services/support/notifications.server.ts) using the existing mailer.
 *      Never throws: an unconfigured mailer or unresolvable owner email is
 *      reported back as an honest, structured failure so the caller can log
 *      it loudly instead of silently dropping the request.
 *
 * Model coverage (enumerated from apps/web/prisma/schema.prisma):
 *   - customerId-bearing models: DataCapture, DataStoreRecord, ModuleEvent,
 *     AttributionLink — the exact set webhooks.customers.redact.tsx already
 *     scopes to. Skipped (with a note) when the webhook payload carries no
 *     customer id.
 *   - SupportTicket (+ non-internal SupportTicketMessage rows): the only
 *     other model that stores shopper-authored PII. It has no customerId
 *     column, so it's matched by `shopperEmail` instead — skipped (with a
 *     note) when the payload carries no customer email. Internal admin notes
 *     (SupportTicketMessage.internal === true) are excluded — those are the
 *     business's internal deliberation, not customer-provided data.
 *   - Shopify order data itself is never stored in this app's own database
 *     (no Order model) — only order-linked attribution rows are included;
 *     the note in the export says so explicitly so the merchant knows to
 *     pull full order records from Shopify Admin directly.
 */

import { sendEmail, resolveMailerStatus } from '~/services/notifications/mailer.server';
import { unauthenticated } from '~/shopify.server';

/** Row cap per model — bounds query cost and email size; the export says so when hit. */
export const EXPORT_ROW_CAP = 300;
/** Soft byte cap on the serialized export before it's embedded in an email. */
export const EXPORT_BYTE_CAP = 200_000;

export interface CustomerDataExportRecords {
  dataCaptures: Array<{
    id: string;
    captureType: string;
    payload: string;
    piiFlags: string | null;
    createdAt: Date;
  }>;
  dataStoreRecords: Array<{
    id: string;
    dataStoreId: string;
    externalId: string | null;
    title: string | null;
    payload: string;
    createdAt: Date;
  }>;
  moduleEvents: Array<{
    id: string;
    timestamp: Date;
    moduleId: string;
    eventName: string;
    eventProperties: string | null;
    valueMetrics: string | null;
    surfaceType: string | null;
    target: string | null;
  }>;
  attributionLinks: Array<{
    id: string;
    sessionId: string;
    visitorId: string | null;
    checkoutToken: string | null;
    orderId: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    source: string | null;
  }>;
  supportTickets: Array<{
    id: string;
    subject: string;
    description: string;
    status: string;
    source: string;
    createdAt: Date;
    updatedAt: Date;
    messages: Array<{ role: string; body: string; createdAt: Date }>;
  }>;
}

export interface CustomerDataExport {
  generatedAt: string;
  shopDomain: string;
  customerId: string | null;
  customerEmail: string | null;
  webhookEventId: string | null;
  rowCapPerModel: number;
  counts: {
    dataCaptures: number;
    dataStoreRecords: number;
    moduleEvents: number;
    attributionLinks: number;
    supportTickets: number;
  };
  records: CustomerDataExportRecords;
  notes: string[];
}

/**
 * Minimal Prisma client surface this module needs — kept narrow so tests can pass a plain
 * fake. `args: any` (not `unknown`) so the real, more strictly-typed PrismaClient methods
 * stay assignable — a parameter typed `unknown` rejects narrower signatures (same pattern
 * as AdminGraphqlClient in services/support/notifications.server.ts).
 */
export interface GdprExportPrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataCapture: { findMany: (args: any) => Promise<CustomerDataExportRecords['dataCaptures']> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataStoreRecord: { findMany: (args: any) => Promise<CustomerDataExportRecords['dataStoreRecords']> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moduleEvent: { findMany: (args: any) => Promise<CustomerDataExportRecords['moduleEvents']> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributionLink: { findMany: (args: any) => Promise<CustomerDataExportRecords['attributionLinks']> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supportTicket: { findMany: (args: any) => Promise<CustomerDataExportRecords['supportTickets']> };
}

export interface CompileExportOptions {
  shopId: string;
  shopDomain: string;
  customerId: string | null;
  customerEmail: string | null;
  webhookEventId: string | null;
}

const ORDER_DATA_NOTE =
  'Shopify order records are not stored in this app\'s own database (no Order model) — only ' +
  'order-linked attribution rows (attributionLinks) are included here. Full order details must ' +
  'be retrieved from Shopify Admin directly.';

export async function compileCustomerDataExport(
  prisma: GdprExportPrismaClient,
  opts: CompileExportOptions,
): Promise<CustomerDataExport> {
  const { shopId, shopDomain, customerId, customerEmail, webhookEventId } = opts;
  const notes: string[] = [ORDER_DATA_NOTE];

  let dataCaptures: CustomerDataExportRecords['dataCaptures'] = [];
  let dataStoreRecords: CustomerDataExportRecords['dataStoreRecords'] = [];
  let moduleEvents: CustomerDataExportRecords['moduleEvents'] = [];
  let attributionLinks: CustomerDataExportRecords['attributionLinks'] = [];

  if (customerId != null) {
    [dataCaptures, dataStoreRecords, moduleEvents, attributionLinks] = await Promise.all([
      prisma.dataCapture.findMany({
        where: { shopId, customerId },
        select: { id: true, captureType: true, payload: true, piiFlags: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ROW_CAP,
      }),
      prisma.dataStoreRecord.findMany({
        where: { customerId, dataStore: { shopId } },
        select: { id: true, dataStoreId: true, externalId: true, title: true, payload: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ROW_CAP,
      }),
      prisma.moduleEvent.findMany({
        where: { shopId, customerId },
        select: {
          id: true,
          timestamp: true,
          moduleId: true,
          eventName: true,
          eventProperties: true,
          valueMetrics: true,
          surfaceType: true,
          target: true,
        },
        orderBy: { timestamp: 'desc' },
        take: EXPORT_ROW_CAP,
      }),
      prisma.attributionLink.findMany({
        where: { shopId, customerId },
        select: {
          id: true,
          sessionId: true,
          visitorId: true,
          checkoutToken: true,
          orderId: true,
          firstSeenAt: true,
          lastSeenAt: true,
          source: true,
        },
        orderBy: { firstSeenAt: 'desc' },
        take: EXPORT_ROW_CAP,
      }),
    ]);
  } else {
    notes.push(
      'The webhook payload carried no customer id — DataCapture, DataStoreRecord, ModuleEvent and ' +
        'AttributionLink cannot be scoped to a specific customer and are omitted from this export.',
    );
  }

  let supportTickets: CustomerDataExportRecords['supportTickets'] = [];
  if (customerEmail) {
    supportTickets = await prisma.supportTicket.findMany({
      // mode: 'insensitive' (Postgres-only, confirmed this schema's datasource) — a shopper's
      // stored email casing can differ from what Shopify sends on the webhook payload; an
      // exact-match comparison would silently drop their support-ticket history from the export.
      where: { shopId, shopperEmail: { equals: customerEmail, mode: 'insensitive' } },
      select: {
        id: true,
        subject: true,
        description: true,
        status: true,
        source: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          where: { internal: false },
          select: { role: true, body: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: EXPORT_ROW_CAP,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_CAP,
    });
  } else {
    notes.push(
      'The webhook payload carried no customer email — SupportTicket cannot be matched (it has no ' +
        'customerId column; it is matched by shopperEmail) and is omitted from this export.',
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    shopDomain,
    customerId,
    customerEmail,
    webhookEventId,
    rowCapPerModel: EXPORT_ROW_CAP,
    counts: {
      dataCaptures: dataCaptures.length,
      dataStoreRecords: dataStoreRecords.length,
      moduleEvents: moduleEvents.length,
      attributionLinks: attributionLinks.length,
      supportTickets: supportTickets.length,
    },
    records: { dataCaptures, dataStoreRecords, moduleEvents, attributionLinks, supportTickets },
    notes,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Reduce an email address to its domain so recipient PII never lands in an audit log. */
function redactToDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : 'redacted';
}

const arrayKeys = ['dataCaptures', 'dataStoreRecords', 'moduleEvents', 'attributionLinks', 'supportTickets'] as const;
type ArrayKey = (typeof arrayKeys)[number];

const TRUNCATION_NOTE =
  'TRUNCATED: this export exceeded the size cap for email delivery — some records were removed ' +
  '(largest models first) to fit. The counts above reflect the FULL compiled data; the records ' +
  'below may be a subset. Query the app database directly for the complete set if needed.';
/** Headroom reserved for the truncation note itself, so adding it can never push the final
 * payload back over EXPORT_BYTE_CAP. */
const TRUNCATION_NOTE_RESERVE_BYTES = 1024;

/**
 * Serialize the export for email delivery, truncating the largest record
 * arrays (largest-first) until the JSON fits EXPORT_BYTE_CAP. Never mutates
 * the caller's exportPayload — works on a deep-cloned copy.
 *
 * Trims by tracking each array's serialized byte size incrementally (O(n))
 * rather than re-stringifying the whole payload on every pop (O(n^2)), which
 * matters once a single request compiles thousands of rows.
 */
function serializeForDelivery(exportPayload: CustomerDataExport): { json: string; truncated: boolean; byteLength: number } {
  const clone: CustomerDataExport = JSON.parse(JSON.stringify(exportPayload));

  const shellBytes = Buffer.byteLength(
    JSON.stringify({
      ...clone,
      records: { dataCaptures: [], dataStoreRecords: [], moduleEvents: [], attributionLinks: [], supportTickets: [] },
    }),
    'utf8',
  );

  const itemBytes: Record<ArrayKey, number[]> = {
    dataCaptures: [],
    dataStoreRecords: [],
    moduleEvents: [],
    attributionLinks: [],
    supportTickets: [],
  };
  const arraySums: Record<ArrayKey, number> = {
    dataCaptures: 0,
    dataStoreRecords: 0,
    moduleEvents: 0,
    attributionLinks: 0,
    supportTickets: 0,
  };
  let total = shellBytes;
  for (const key of arrayKeys) {
    for (const item of clone.records[key]) {
      // +1 approximates the joining comma; exact to within a few bytes/array, which is fine for a size cap.
      const len = Buffer.byteLength(JSON.stringify(item), 'utf8') + 1;
      itemBytes[key].push(len);
      arraySums[key] += len;
      total += len;
    }
  }

  let truncated = false;
  const budget = EXPORT_BYTE_CAP - TRUNCATION_NOTE_RESERVE_BYTES;
  while (total > budget) {
    let largestKey: ArrayKey | null = null;
    let largestArraySum = 0;
    for (const key of arrayKeys) {
      if (arraySums[key] > largestArraySum) {
        largestArraySum = arraySums[key];
        largestKey = key;
      }
    }
    if (!largestKey || largestArraySum === 0) break;
    const removedBytes = itemBytes[largestKey].pop() ?? 0;
    (clone.records[largestKey] as unknown[]).pop();
    arraySums[largestKey] -= removedBytes;
    total -= removedBytes;
    truncated = true;
  }

  if (truncated) {
    clone.notes = [...clone.notes, TRUNCATION_NOTE];
    // Propagate the truncation note back onto the CALLER's (non-cloned) export too — the
    // route builds its ActivityLog details from exportPayload.notes after delivery, so
    // without this the merchant-visible audit trail would silently omit that the emailed
    // copy was a subset.
    if (!exportPayload.notes.includes(TRUNCATION_NOTE)) exportPayload.notes.push(TRUNCATION_NOTE);
  }

  const json = JSON.stringify(clone);
  return { json, truncated, byteLength: Buffer.byteLength(json, 'utf8') };
}

export interface DeliverExportOptions {
  shopDomain: string;
  exportPayload: CustomerDataExport;
}

export interface DeliverExportResult {
  emailSent: boolean;
  mailerConfigured: boolean;
  recipientDomain: string | null;
  truncated: boolean;
  byteLength: number;
  reason?: string;
}

async function resolveShopOwnerEmail(shopDomain: string): Promise<string | null> {
  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const response = await admin.graphql('#graphql\n      query GdprDataRequestShopEmail { shop { email } }\n    ');
    const body = (await response.json()) as { data?: { shop?: { email?: string | null } } };
    const email = body?.data?.shop?.email;
    return typeof email === 'string' && email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

/**
 * Email the compiled export to the shop owner. Never throws — every failure
 * mode (mailer unconfigured, owner email unresolvable, send failure, admin
 * client unavailable) resolves to { emailSent: false, reason } so the caller
 * can record a loud, honest failure instead of silently dropping the request.
 */
export async function deliverCustomerDataExport(opts: DeliverExportOptions): Promise<DeliverExportResult> {
  let json: string;
  let truncated = false;
  let byteLength = 0;
  try {
    // serializeForDelivery does its own JSON.stringify/parse round-trips (deep clone,
    // byte-size accounting) which can theoretically throw (e.g. a pathological/circular
    // export payload) — guarded here so this function's never-throws contract is literally
    // true, not just true for the common case.
    const serialized = serializeForDelivery(opts.exportPayload);
    json = serialized.json;
    truncated = serialized.truncated;
    byteLength = serialized.byteLength;
  } catch {
    return {
      emailSent: false,
      mailerConfigured: false,
      recipientDomain: null,
      truncated: false,
      byteLength: 0,
      reason: 'serialize_failed',
    };
  }

  let mailerConfigured = false;
  try {
    const status = await resolveMailerStatus();
    mailerConfigured = status.configured;
  } catch {
    mailerConfigured = false;
  }

  if (!mailerConfigured) {
    return { emailSent: false, mailerConfigured: false, recipientDomain: null, truncated, byteLength, reason: 'mailer_not_configured' };
  }

  const ownerEmail = await resolveShopOwnerEmail(opts.shopDomain);
  if (!ownerEmail) {
    return {
      emailSent: false,
      mailerConfigured: true,
      recipientDomain: null,
      truncated,
      byteLength,
      reason: 'owner_email_unresolved',
    };
  }

  const subject = `[SuperApp] Customer data request export — ${opts.exportPayload.customerId ?? opts.exportPayload.customerEmail ?? 'unknown customer'}`.slice(
    0,
    200,
  );
  const truncationBanner = truncated
    ? '<p style="color:#b00020;"><strong>TRUNCATED — this export exceeded the size cap; see notes below.</strong></p>'
    : '';
  const html = [
    `<p><strong>GDPR customer data request export</strong></p>`,
    `<p><strong>Shop:</strong> ${escapeHtml(opts.shopDomain)}</p>`,
    truncationBanner,
    `<pre style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(json)}</pre>`,
  ]
    .filter(Boolean)
    .join('\n');
  const text = [
    'GDPR customer data request export',
    `Shop: ${opts.shopDomain}`,
    truncated ? 'TRUNCATED — this export exceeded the size cap; see notes in the JSON below.' : null,
    json,
  ]
    .filter(Boolean)
    .join('\n');

  let result: { sent: boolean; error?: string };
  try {
    result = await sendEmail({ to: ownerEmail, subject, html, text });
  } catch {
    result = { sent: false, error: 'send_threw' };
  }

  return {
    emailSent: result.sent,
    mailerConfigured: true,
    recipientDomain: redactToDomain(ownerEmail),
    truncated,
    byteLength,
    reason: result.sent ? undefined : result.error ?? 'send_failed',
  };
}

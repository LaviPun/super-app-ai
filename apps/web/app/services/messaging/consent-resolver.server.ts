/**
 * Marketing-consent resolver (build #7b).
 *
 * SMS and email marketing sends MUST be gated on the customer's current
 * marketing-consent state. Shopify is the source of truth: a customer's
 * `defaultPhoneNumber.marketingState` / `defaultEmailAddress.marketingState` is
 * `SUBSCRIBED` only when they've explicitly opted in. We NEVER send to a recipient
 * whose state isn't `SUBSCRIBED`.
 *
 * (2026-04 note: `customer.smsMarketingConsent` / `customer.emailMarketingConsent`
 * and `customer.phone` / `customer.email` are deprecated in favour of
 * `defaultPhoneNumber.*` / `defaultEmailAddress.*` — this resolver uses the current
 * fields, verified via dev-MCP `validate_graphql_codeblocks`.)
 *
 * The resolver reads consent from Shopify when a recipient carries a customer GID
 * (`__customerId` / `customer.id` / `customer_id` on the record or event). When there
 * is no GID to look up, it falls back to the record's own consent field (the
 * merchant-maintained opt-in flag on the DataStore row) — so a merchant capturing
 * consent at signup is still honoured, and the send is never made on a bare address
 * with no opt-in signal at all.
 */

import type { MessagingChannel } from '@superapp/core';

/** A resolver hits Shopify Admin GraphQL; overridable in tests. */
export type AdminGraphqlFn = (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;

/** The consent verdict for one recipient + channel. */
export type ConsentVerdict = {
  /** True only when the recipient is verifiably opted in for this channel. */
  ok: boolean;
  /** Where the verdict came from (for logs/audit). */
  source: 'shopify' | 'record_field' | 'none';
  /** The Shopify marketing state, when resolved via Shopify. */
  state?: string;
};

const CONSENT_QUERY = `#graphql
  query MessagingCustomerConsent($id: ID!) {
    customer(id: $id) {
      id
      defaultPhoneNumber { phoneNumber marketingState }
      defaultEmailAddress { emailAddress marketingState }
    }
  }
`;

type CustomerConsentNode = {
  id: string;
  defaultPhoneNumber?: { phoneNumber?: string | null; marketingState?: string | null } | null;
  defaultEmailAddress?: { emailAddress?: string | null; marketingState?: string | null } | null;
};

/** Pull a customer GID out of a recipient record or the triggering event. */
export function customerGidFrom(record: Record<string, unknown>, event: unknown): string | undefined {
  const candidates: unknown[] = [
    record.__customerId,
    record.customerId,
    record.customer_id,
    isRecord(record.customer) ? record.customer.id : undefined,
    isRecord(event) ? readPath(event, 'customer.admin_graphql_api_id') : undefined,
    isRecord(event) ? readPath(event, 'customer.id') : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c) {
      if (c.startsWith('gid://shopify/Customer/')) return c;
      if (/^\d+$/.test(c)) return `gid://shopify/Customer/${c}`;
    }
    if (typeof c === 'number' && Number.isFinite(c)) return `gid://shopify/Customer/${c}`;
  }
  return undefined;
}

/**
 * Resolve whether a recipient is opted in for `channel`.
 *
 *  - With a customer GID + an admin graphql client → query Shopify; opted in iff the
 *    channel's `marketingState === 'SUBSCRIBED'`.
 *  - Without a GID (or when the lookup fails) → fall back to the record's consent
 *    field (a truthy merchant-maintained opt-in flag). If neither is available, the
 *    verdict is `ok:false` (`source:'none'`) — we never send without an opt-in signal.
 */
export async function resolveConsent(input: {
  channel: MessagingChannel;
  record: Record<string, unknown>;
  event: unknown;
  consentField?: string;
  graphql?: AdminGraphqlFn;
}): Promise<ConsentVerdict> {
  const { channel, record, event, consentField, graphql } = input;

  const gid = customerGidFrom(record, event);
  if (gid && graphql) {
    try {
      const res = await graphql(CONSENT_QUERY, { variables: { id: gid } });
      const body = (await res.json()) as { data?: { customer?: CustomerConsentNode | null } };
      const customer = body.data?.customer;
      if (customer) {
        const state =
          channel === 'sms'
            ? customer.defaultPhoneNumber?.marketingState ?? undefined
            : channel === 'email'
              ? customer.defaultEmailAddress?.marketingState ?? undefined
              : undefined;
        if (state != null) {
          return { ok: state === 'SUBSCRIBED', source: 'shopify', state };
        }
      }
    } catch {
      // Fall through to the record-field check — never throw a consent lookup into
      // the send loop (that would black-hole a whole page).
    }
  }

  // Fallback: the merchant-maintained opt-in flag on the record.
  if (consentField) {
    return { ok: truthy(record[consentField]), source: 'record_field' };
  }

  // No GID, no consent field → no opt-in signal. Do not send.
  return { ok: false, source: 'none' };
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s !== '' && s !== 'false' && s !== '0' && s !== 'no';
  }
  return true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readPath(root: unknown, dotted: string): unknown {
  const parts = dotted.split('.');
  let val: unknown = root;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return undefined;
    val = (val as Record<string, unknown>)[p];
  }
  return val;
}

import { describe, it, expect, vi } from 'vitest';
import { resolveConsent, customerGidFrom } from '~/services/messaging/consent-resolver.server';

/**
 * Marketing-consent resolver (build #7b). SMS/email sends are opt-in-only: the
 * customer's Shopify marketingState must be SUBSCRIBED. Without a customer GID we fall
 * back to the record's opt-in field; with neither, we never send.
 */

function graphqlReturning(state: string | null, channel: 'sms' | 'email') {
  return vi.fn(async () => ({
    json: async () => ({
      data: {
        customer: {
          id: 'gid://shopify/Customer/1',
          defaultPhoneNumber: channel === 'sms' ? { phoneNumber: '+1', marketingState: state } : null,
          defaultEmailAddress: channel === 'email' ? { emailAddress: 'a@x.com', marketingState: state } : null,
        },
      },
    }),
  })) as never;
}

describe('customerGidFrom', () => {
  it('reads a GID from the record or event, normalizing a bare numeric id', () => {
    expect(customerGidFrom({ __customerId: 'gid://shopify/Customer/9' }, {})).toBe('gid://shopify/Customer/9');
    expect(customerGidFrom({ customer_id: 42 }, {})).toBe('gid://shopify/Customer/42');
    expect(customerGidFrom({}, { customer: { id: 7 } })).toBe('gid://shopify/Customer/7');
    expect(customerGidFrom({}, {})).toBeUndefined();
  });
});

describe('resolveConsent — Shopify is the source of truth', () => {
  it('sms: SUBSCRIBED → ok; anything else → not ok', async () => {
    const okv = await resolveConsent({
      channel: 'sms',
      record: { __customerId: 'gid://shopify/Customer/1' },
      event: {},
      graphql: graphqlReturning('SUBSCRIBED', 'sms'),
    });
    expect(okv).toEqual({ ok: true, source: 'shopify', state: 'SUBSCRIBED' });

    for (const bad of ['NOT_SUBSCRIBED', 'UNSUBSCRIBED', 'PENDING', 'REDACTED']) {
      const v = await resolveConsent({
        channel: 'sms',
        record: { __customerId: 'gid://shopify/Customer/1' },
        event: {},
        graphql: graphqlReturning(bad, 'sms'),
      });
      expect(v.ok).toBe(false);
      expect(v.source).toBe('shopify');
    }
  });

  it('email: reads defaultEmailAddress.marketingState', async () => {
    const v = await resolveConsent({
      channel: 'email',
      record: { __customerId: 'gid://shopify/Customer/1' },
      event: {},
      graphql: graphqlReturning('SUBSCRIBED', 'email'),
    });
    expect(v.ok).toBe(true);
  });

  it('falls back to the record consent field when there is no customer GID', async () => {
    const yes = await resolveConsent({ channel: 'sms', record: { smsConsent: true }, event: {}, consentField: 'smsConsent' });
    expect(yes).toEqual({ ok: true, source: 'record_field' });
    const no = await resolveConsent({ channel: 'sms', record: { smsConsent: false }, event: {}, consentField: 'smsConsent' });
    expect(no.ok).toBe(false);
  });

  it('never sends with no opt-in signal at all (no GID, no consent field)', async () => {
    const v = await resolveConsent({ channel: 'sms', record: { phone: '+1' }, event: {} });
    expect(v).toEqual({ ok: false, source: 'none' });
  });

  it('a graphql failure falls through to the record field, never throws', async () => {
    const boom = vi.fn(async () => {
      throw new Error('network');
    }) as never;
    const v = await resolveConsent({
      channel: 'sms',
      record: { __customerId: 'gid://shopify/Customer/1', smsConsent: true },
      event: {},
      consentField: 'smsConsent',
      graphql: boom,
    });
    expect(v).toEqual({ ok: true, source: 'record_field' });
  });
});

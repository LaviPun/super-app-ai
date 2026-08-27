import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the GDPR customers/data_request compilation + delivery helpers
 * (apps/web/app/services/gdpr/data-request-export.server.ts).
 *
 * These cover the two things the old webhook handler never did:
 *   1. Compile an actual data package (not just a count) across every
 *      customerId/email-scoped model — DataCapture, DataStoreRecord,
 *      ModuleEvent, AttributionLink (the same set customers/redact already
 *      scopes to) plus SupportTicket (shopper-sourced tickets, matched by
 *      shopperEmail since that model has no customerId column).
 *   2. Deliver that package to the merchant (email) with a loud, honest
 *      outcome when the mailer is unconfigured or delivery otherwise fails.
 */

const { sendEmailMock, resolveMailerStatusMock, adminGraphqlMock, unauthenticatedAdminMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  resolveMailerStatusMock: vi.fn(),
  adminGraphqlMock: vi.fn(),
  unauthenticatedAdminMock: vi.fn(),
}));

vi.mock('~/services/notifications/mailer.server', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  resolveMailerStatus: (...args: unknown[]) => resolveMailerStatusMock(...args),
}));

vi.mock('~/shopify.server', () => ({
  unauthenticated: {
    admin: (...args: unknown[]) => unauthenticatedAdminMock(...args),
  },
}));

import {
  compileCustomerDataExport,
  deliverCustomerDataExport,
  EXPORT_ROW_CAP,
  EXPORT_BYTE_CAP,
} from '~/services/gdpr/data-request-export.server';

function makePrismaMock() {
  return {
    dataCapture: { findMany: vi.fn(async () => []) },
    dataStoreRecord: { findMany: vi.fn(async () => []) },
    moduleEvent: { findMany: vi.fn(async () => []) },
    attributionLink: { findMany: vi.fn(async () => []) },
    supportTicket: { findMany: vi.fn(async () => []) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  unauthenticatedAdminMock.mockResolvedValue({ admin: { graphql: adminGraphqlMock } });
  adminGraphqlMock.mockResolvedValue({ json: async () => ({ data: { shop: { email: 'owner@shop.test' } } }) });
  resolveMailerStatusMock.mockResolvedValue({ configured: true, provider: 'sendgrid', from: 'noreply@app.test' });
  sendEmailMock.mockResolvedValue({ sent: true });
});

describe('compileCustomerDataExport', () => {
  it('scopes every customerId-bearing model by BOTH shopId and customerId', async () => {
    const prisma = makePrismaMock();
    await compileCustomerDataExport(prisma as never, {
      shopId: 'shop-1',
      shopDomain: 'gdpr.myshopify.com',
      customerId: '555',
      customerEmail: 'shopper@example.com',
      webhookEventId: 'evt-1',
    });

    expect(prisma.dataCapture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-1', customerId: '555' }) }),
    );
    expect(prisma.dataStoreRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: '555', dataStore: expect.objectContaining({ shopId: 'shop-1' }) }),
      }),
    );
    expect(prisma.moduleEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-1', customerId: '555' }) }),
    );
    expect(prisma.attributionLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-1', customerId: '555' }) }),
    );
  });

  it('caps every model query at EXPORT_ROW_CAP rows', async () => {
    const prisma = makePrismaMock();
    await compileCustomerDataExport(prisma as never, {
      shopId: 'shop-1',
      shopDomain: 'gdpr.myshopify.com',
      customerId: '555',
      customerEmail: null,
      webhookEventId: null,
    });
    for (const model of [prisma.dataCapture, prisma.dataStoreRecord, prisma.moduleEvent, prisma.attributionLink]) {
      expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: EXPORT_ROW_CAP }));
    }
  });

  it('matches SupportTicket by shopperEmail (the model has no customerId column), case-insensitively, and excludes internal notes', async () => {
    const prisma = makePrismaMock();
    await compileCustomerDataExport(prisma as never, {
      shopId: 'shop-1',
      shopDomain: 'gdpr.myshopify.com',
      customerId: '555',
      customerEmail: 'shopper@example.com',
      webhookEventId: null,
    });

    // mode: 'insensitive' (Postgres) — a plain string-equality where clause would silently
    // drop tickets whose stored shopperEmail casing differs from the webhook payload's.
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop-1', shopperEmail: { equals: 'shopper@example.com', mode: 'insensitive' } },
        select: expect.objectContaining({
          messages: expect.objectContaining({ where: { internal: false } }),
        }),
      }),
    );
  });

  it('finds a support ticket whose STORED shopperEmail casing differs from the webhook payload (mixed-case vs lowercase)', async () => {
    // A prisma fake that actually implements Postgres' `mode: 'insensitive'` filtering
    // semantics on the `where` shape our code sends, rather than just recording the call —
    // so this test is red against the historical exact-match `shopperEmail: customerEmail`
    // code (which passes a plain string, so this fake's case-sensitive branch runs and
    // finds nothing) and green only once the query is genuinely case-insensitive.
    const storedTicket = {
      id: 't1',
      subject: 'Where is my order',
      description: 'It has not arrived',
      status: 'OPEN',
      source: 'SHOPPER',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      shopperEmail: 'Shopper@Example.com',
    };
    const prisma = makePrismaMock();
    prisma.supportTicket.findMany = vi.fn(
      async ({ where }: { where: { shopId: string; shopperEmail: string | { equals: string; mode?: string } } }) => {
        if (where.shopId !== 'shop-1') return [];
        const isInsensitive = typeof where.shopperEmail === 'object' && where.shopperEmail.mode === 'insensitive';
        const target = typeof where.shopperEmail === 'string' ? where.shopperEmail : where.shopperEmail.equals;
        const matches = isInsensitive
          ? storedTicket.shopperEmail.toLowerCase() === target.toLowerCase()
          : storedTicket.shopperEmail === target;
        return matches ? [storedTicket] : [];
      },
    );

    const result = await compileCustomerDataExport(prisma as never, {
      shopId: 'shop-1',
      shopDomain: 'gdpr.myshopify.com',
      customerId: null,
      customerEmail: 'shopper@example.com',
      webhookEventId: null,
    });

    expect(result.records.supportTickets).toHaveLength(1);
    expect(result.counts.supportTickets).toBe(1);
    // Present but no rows found is still a legitimate "no support history" outcome, not an
    // error — no false note should be added just because the count is zero elsewhere.
  });

  it('skips SupportTicket lookup and records a note when no customer email is present', async () => {
    const prisma = makePrismaMock();
    const result = await compileCustomerDataExport(prisma as never, {
      shopId: 'shop-1',
      shopDomain: 'gdpr.myshopify.com',
      customerId: '555',
      customerEmail: null,
      webhookEventId: null,
    });
    expect(prisma.supportTicket.findMany).not.toHaveBeenCalled();
    expect(result.notes.join(' ')).toMatch(/email/i);
  });

  it('skips the customerId-scoped models and records a note when no customerId is present', async () => {
    const prisma = makePrismaMock();
    const result = await compileCustomerDataExport(prisma as never, {
      shopId: 'shop-1',
      shopDomain: 'gdpr.myshopify.com',
      customerId: null,
      customerEmail: null,
      webhookEventId: null,
    });
    expect(prisma.dataCapture.findMany).not.toHaveBeenCalled();
    expect(result.notes.join(' ')).toMatch(/customerId/i);
  });

  it('returns per-model counts matching the compiled records', async () => {
    const prisma = makePrismaMock();
    prisma.dataCapture.findMany = vi.fn(async () => [
      { id: 'c1', captureType: 'survey_response', payload: '{}', piiFlags: null, createdAt: new Date() },
      { id: 'c2', captureType: 'note', payload: '{}', piiFlags: null, createdAt: new Date() },
    ]);
    const result = await compileCustomerDataExport(prisma as never, {
      shopId: 'shop-1',
      shopDomain: 'gdpr.myshopify.com',
      customerId: '555',
      customerEmail: null,
      webhookEventId: null,
    });
    expect(result.counts.dataCaptures).toBe(2);
    expect(result.records.dataCaptures).toHaveLength(2);
  });
});

describe('deliverCustomerDataExport', () => {
  function fakeExport(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      generatedAt: new Date().toISOString(),
      shopDomain: 'gdpr.myshopify.com',
      customerId: '555',
      customerEmail: 'shopper@example.com',
      webhookEventId: 'evt-1',
      rowCapPerModel: EXPORT_ROW_CAP,
      counts: { dataCaptures: 1, dataStoreRecords: 0, moduleEvents: 0, attributionLinks: 0, supportTickets: 0 },
      records: {
        dataCaptures: [{ id: 'c1', captureType: 'note', payload: 'hello', piiFlags: null, createdAt: new Date() }],
        dataStoreRecords: [],
        moduleEvents: [],
        attributionLinks: [],
        supportTickets: [],
      },
      notes: [],
      ...overrides,
    };
  }

  it('resolves the shop owner email and emails the compiled export when the mailer is configured', async () => {
    const result = await deliverCustomerDataExport({ shopDomain: 'gdpr.myshopify.com', exportPayload: fakeExport() as never });

    expect(unauthenticatedAdminMock).toHaveBeenCalledWith('gdpr.myshopify.com');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [sendArgs] = sendEmailMock.mock.calls[0] as [{ to: string; subject: string; html: string; text: string }];
    expect(sendArgs.to).toBe('owner@shop.test');
    expect(sendArgs.html).toContain('c1');
    expect(result.emailSent).toBe(true);
    expect(result.mailerConfigured).toBe(true);
  });

  it('returns a loud, honest failure — never throws — when the mailer is unconfigured', async () => {
    resolveMailerStatusMock.mockResolvedValue({ configured: false, provider: null, from: null });
    const result = await deliverCustomerDataExport({ shopDomain: 'gdpr.myshopify.com', exportPayload: fakeExport() as never });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
    expect(result.mailerConfigured).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('reports failure honestly when the shop owner email cannot be resolved', async () => {
    adminGraphqlMock.mockResolvedValue({ json: async () => ({ data: { shop: { email: null } } }) });
    const result = await deliverCustomerDataExport({ shopDomain: 'gdpr.myshopify.com', exportPayload: fakeExport() as never });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
    expect(result.mailerConfigured).toBe(true);
    expect(result.reason).toMatch(/owner|email/i);
  });

  it('never throws even when resolving the admin client throws', async () => {
    unauthenticatedAdminMock.mockRejectedValue(new Error('no offline session'));
    await expect(
      deliverCustomerDataExport({ shopDomain: 'gdpr.myshopify.com', exportPayload: fakeExport() as never }),
    ).resolves.toMatchObject({ emailSent: false });
  });

  it('truncates the export and says so loudly when it exceeds the byte cap', async () => {
    const bigRecords = Array.from({ length: 5000 }, (_, i) => ({
      id: `c${i}`,
      captureType: 'note',
      payload: 'x'.repeat(200),
      piiFlags: null,
      createdAt: new Date(),
    }));
    const result = await deliverCustomerDataExport({
      shopDomain: 'gdpr.myshopify.com',
      exportPayload: fakeExport({
        records: { dataCaptures: bigRecords, dataStoreRecords: [], moduleEvents: [], attributionLinks: [], supportTickets: [] },
        counts: { dataCaptures: bigRecords.length, dataStoreRecords: 0, moduleEvents: 0, attributionLinks: 0, supportTickets: 0 },
      }) as never,
    });

    expect(result.truncated).toBe(true);
    expect(result.byteLength).toBeLessThanOrEqual(EXPORT_BYTE_CAP);
    const [sendArgs] = sendEmailMock.mock.calls[0] as [{ html: string; text: string }];
    expect(sendArgs.html.toLowerCase()).toContain('truncat');
    expect(sendArgs.text.toLowerCase()).toContain('truncat');
  });

  it('propagates the TRUNCATED note back onto the caller-owned exportPayload.notes (so ActivityLog shows it too)', async () => {
    const bigRecords = Array.from({ length: 5000 }, (_, i) => ({
      id: `c${i}`,
      captureType: 'note',
      payload: 'x'.repeat(200),
      piiFlags: null,
      createdAt: new Date(),
    }));
    const payload = fakeExport({
      records: { dataCaptures: bigRecords, dataStoreRecords: [], moduleEvents: [], attributionLinks: [], supportTickets: [] },
      counts: { dataCaptures: bigRecords.length, dataStoreRecords: 0, moduleEvents: 0, attributionLinks: 0, supportTickets: 0 },
    });

    expect((payload.notes as string[]).some((n) => n.includes('TRUNCATED'))).toBe(false);
    await deliverCustomerDataExport({ shopDomain: 'gdpr.myshopify.com', exportPayload: payload as never });
    expect((payload.notes as string[]).some((n) => n.includes('TRUNCATED'))).toBe(true);
  });

  it('never throws even when serializing the export itself fails (e.g. a circular payload)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const circular: any = { id: 'c1', captureType: 'note', payload: 'x', piiFlags: null, createdAt: new Date() };
    circular.self = circular; // forces JSON.stringify inside serializeForDelivery to throw
    const payload = fakeExport({
      records: { dataCaptures: [circular], dataStoreRecords: [], moduleEvents: [], attributionLinks: [], supportTickets: [] },
    });

    await expect(
      deliverCustomerDataExport({ shopDomain: 'gdpr.myshopify.com', exportPayload: payload as never }),
    ).resolves.toMatchObject({ emailSent: false });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

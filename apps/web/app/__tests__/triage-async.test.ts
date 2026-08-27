import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WS-G Task 20: support ticket creation must return before triage completes —
 * it enqueues SUPPORT_TRIAGE_RUN (Task 14's registry, via ops-queue.server's
 * enqueueOwnedJob) instead of awaiting runSupportTriage inline. D5's
 * default/failover triage logic is unaffected — it now runs inside the
 * worker's SUPPORT_TRIAGE_RUN executor (support-triage-job.server.ts)
 * instead of the request.
 */

const { authAdminMock, enqueueMock, runTriageMock, activityLogMock, rateLimitMock } = vi.hoisted(() => ({
  authAdminMock: vi.fn(async () => ({ session: { shop: 'shop.example.myshopify.com', accessToken: 'tok' } })),
  enqueueMock: vi.fn(async () => ({ jobId: 'job_t', queued: true })),
  runTriageMock: vi.fn(async () => {
    throw new Error('should never be called inline');
  }),
  activityLogMock: vi.fn(async () => ({})),
  rateLimitMock: vi.fn(async () => {}),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: authAdminMock } },
}));

vi.mock('~/services/security/rate-limit.server', () => ({
  enforceRateLimit: rateLimitMock,
}));

vi.mock('~/services/shops/access-token.server', () => ({
  sealAccessToken: (t: string) => `sealed:${t}`,
}));

const shopFindUniqueMock = vi.fn(async () => ({ id: 'shop-1' }));
const shopCreateMock = vi.fn(async () => ({ id: 'shop-1' }));
const moduleFindFirstMock = vi.fn(async () => ({ id: 'mod-1' }));
const ticketCreateMock = vi.fn(async () => ({ id: 'ticket-1' }));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: shopFindUniqueMock, create: shopCreateMock },
    module: { findFirst: moduleFindFirstMock },
    supportTicket: { create: ticketCreateMock },
  }),
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = activityLogMock;
  },
}));

vi.mock('~/services/support/ticket-events.server', () => ({
  recordTicketEvent: vi.fn(async () => ({})),
}));

vi.mock('~/services/jobs/ops-queue.server', () => ({
  enqueueOwnedJob: enqueueMock,
}));

vi.mock('~/services/support/triage.server', () => ({
  runSupportTriage: runTriageMock,
}));

function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return { request: { method: 'POST', formData: async () => form } } as never;
}

describe('api.support.create — triage moved async (WS-G Task 20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authAdminMock.mockResolvedValue({ session: { shop: 'shop.example.myshopify.com', accessToken: 'tok' } });
    shopFindUniqueMock.mockResolvedValue({ id: 'shop-1' });
    ticketCreateMock.mockResolvedValue({ id: 'ticket-1' });
    enqueueMock.mockResolvedValue({ jobId: 'job_t', queued: true });
  });

  it('ticket creation returns before triage completes — enqueues SUPPORT_TRIAGE_RUN instead of awaiting runSupportTriage inline', async () => {
    const { action } = await import('~/routes/api.support.create');
    const res = await action(formRequest({ subject: 'Help', description: 'Something is broken' }));

    expect(res.status).toBeLessThan(400);
    expect(runTriageMock).not.toHaveBeenCalled();
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SUPPORT_TRIAGE_RUN', shopId: 'shop-1', payload: { ticketId: 'ticket-1' } }),
    );
    const body = (await res.json()) as { ok: boolean; ticketId: string; triaged: boolean };
    expect(body.ok).toBe(true);
    expect(body.ticketId).toBe('ticket-1');
  });
});

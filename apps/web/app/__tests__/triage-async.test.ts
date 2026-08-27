import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WS-G Task 20: support ticket creation must return before triage completes —
 * it enqueues SUPPORT_TRIAGE_RUN (Task 14's registry, via ops-queue.server's
 * enqueueOwnedJob) instead of awaiting runSupportTriage inline. D5's
 * default/failover triage logic is unaffected — it now runs inside the
 * worker's SUPPORT_TRIAGE_RUN executor (support-triage-job.server.ts)
 * instead of the request.
 */

const { authAdminMock, enqueueMock, runTriageMock, activityLogMock, rateLimitMock, fireMock, recordTicketEventMock } = vi.hoisted(() => ({
  authAdminMock: vi.fn(async () => ({ session: { shop: 'shop.example.myshopify.com', accessToken: 'tok' } })),
  enqueueMock: vi.fn(async () => ({ jobId: 'job_t', queued: true })),
  runTriageMock: vi.fn(async () => {
    throw new Error('should never be called inline');
  }),
  activityLogMock: vi.fn(async () => ({})),
  rateLimitMock: vi.fn(async () => {}),
  fireMock: vi.fn(async () => ({ sentry: true, email: false, slack: false })),
  recordTicketEventMock: vi.fn(async () => ({})),
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
const ticketUpdateMock = vi.fn(async () => ({ id: 'ticket-1' }));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: shopFindUniqueMock, create: shopCreateMock },
    module: { findFirst: moduleFindFirstMock },
    supportTicket: { create: ticketCreateMock, update: ticketUpdateMock },
  }),
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = activityLogMock;
  },
}));

vi.mock('~/services/support/ticket-events.server', () => ({
  recordTicketEvent: recordTicketEventMock,
}));

vi.mock('~/services/jobs/ops-queue.server', () => ({
  enqueueOwnedJob: enqueueMock,
}));

vi.mock('~/services/support/triage.server', () => ({
  runSupportTriage: runTriageMock,
}));

vi.mock('~/services/observability/ops-alert.server', () => ({
  OpsAlertService: class {
    fire = fireMock;
  },
}));

vi.mock('~/services/observability/logger.server', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('~/services/observability/redact.server', () => ({
  safeErrorMeta: (err: unknown) => ({ error: String(err) }),
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
    fireMock.mockResolvedValue({ sentry: true, email: false, slack: false });
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

  it('fix round (Important #4): an enqueue failure never 500s the already-committed ticket — recorded loudly instead', async () => {
    enqueueMock.mockRejectedValue(new Error('redis unreachable'));

    const { action } = await import('~/routes/api.support.create');
    const res = await action(formRequest({ subject: 'Help', description: 'Something is broken' }));

    // The ticket row was already created — the response must still succeed
    // and carry the real ticketId, never a thrown 500.
    expect(res.status).toBeLessThan(400);
    const body = (await res.json()) as { ok: boolean; ticketId: string; triaged: boolean };
    expect(body.ok).toBe(true);
    expect(body.ticketId).toBe('ticket-1');

    // Recorded loudly: ticket flow event, aiTriageError, and an ops alert.
    expect(recordTicketEventMock).toHaveBeenCalledWith(
      'ticket-1',
      'TRIAGE_FAILED',
      'SYSTEM',
      expect.objectContaining({ reason: 'enqueue failed' }),
    );
    expect(ticketUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-1' },
        data: expect.objectContaining({ aiTriageError: expect.stringContaining('redis unreachable') }),
      }),
    );
    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'TRIAGE_FAILED', context: expect.objectContaining({ ticketId: 'ticket-1' }) }),
    );
  });
});

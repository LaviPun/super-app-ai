import { describe, expect, it, vi, beforeEach } from 'vitest';

const jobCountMock = vi.fn(async (..._a: unknown[]) => 0);
const errorLogCountMock = vi.fn(async (..._a: unknown[]) => 0);
const webhookEventCountMock = vi.fn(async (..._a: unknown[]) => 0);
const supportTicketCountMock = vi.fn(async (..._a: unknown[]) => 0);
const supportTicketEventFindManyMock = vi.fn(async (..._a: unknown[]) => [] as Array<{ ticketId: string; type: string }>);

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    job: { count: (...a: unknown[]) => jobCountMock(...a) },
    errorLog: { count: (...a: unknown[]) => errorLogCountMock(...a) },
    webhookEvent: { count: (...a: unknown[]) => webhookEventCountMock(...a) },
    supportTicket: { count: (...a: unknown[]) => supportTicketCountMock(...a) },
    supportTicketEvent: { findMany: (...a: unknown[]) => supportTicketEventFindManyMock(...a) },
    // DevOps hardening 2026-09: the loader also reads the persisted ops-health
    // snapshot (one guarded single-row read) — null = no snapshot, no banner.
    appSettings: { findUnique: async () => null },
  }),
}));

vi.mock('~/services/settings/settings.service', () => ({
  SettingsService: class {
    async get() {
      return null;
    }
  },
}));

async function authedRequest(): Promise<Request> {
  const { internalSessionStorage } = await import('~/internal-admin/session.server');
  const session = await internalSessionStorage.getSession();
  session.set('internal_admin', true);
  const cookie = await internalSessionStorage.commitSession(session);
  return new Request('https://admin.test/internal', { headers: { cookie } });
}

beforeEach(() => {
  vi.clearAllMocks();
  jobCountMock.mockResolvedValue(0);
  errorLogCountMock.mockResolvedValue(0);
  webhookEventCountMock.mockResolvedValue(0);
  supportTicketCountMock.mockResolvedValue(0);
  supportTicketEventFindManyMock.mockResolvedValue([]);
});

describe('internal.tsx loader → counts.unreadReplies', () => {
  it('a ticket whose LATEST event is MERCHANT_REPLIED counts as unread', async () => {
    supportTicketEventFindManyMock.mockResolvedValue([
      { ticketId: 't1', type: 'MERCHANT_REPLIED' },
    ] as never);
    const { loader } = await import('~/routes/internal');
    const res = await loader({ request: await authedRequest() } as never);
    const body = await res.json();
    expect(body.counts.unreadReplies).toBe(1);
  });

  it('a ticket whose latest event is HUMAN_REPLIED (after MERCHANT_REPLIED) does NOT count as unread', async () => {
    // distinct-latest-per-ticket query: only the most recent event per ticket
    // is returned (mirrors `distinct: ['ticketId']` ordered desc) — so a
    // ticket where staff replied after the merchant contributes HUMAN_REPLIED,
    // not MERCHANT_REPLIED, to this result set.
    supportTicketEventFindManyMock.mockResolvedValue([
      { ticketId: 't2', type: 'HUMAN_REPLIED' },
    ] as never);
    const { loader } = await import('~/routes/internal');
    const res = await loader({ request: await authedRequest() } as never);
    const body = await res.json();
    expect(body.counts.unreadReplies).toBe(0);
  });

  it('counts multiple unread tickets correctly among a mixed set', async () => {
    supportTicketEventFindManyMock.mockResolvedValue([
      { ticketId: 't1', type: 'MERCHANT_REPLIED' },
      { ticketId: 't2', type: 'HUMAN_REPLIED' },
      { ticketId: 't3', type: 'MERCHANT_REPLIED' },
      { ticketId: 't4', type: 'CREATED' },
    ] as never);
    const { loader } = await import('~/routes/internal');
    const res = await loader({ request: await authedRequest() } as never);
    const body = await res.json();
    expect(body.counts.unreadReplies).toBe(2);
  });

  it('is 0 when unauthenticated (loader never queries the DB)', async () => {
    const { loader } = await import('~/routes/internal');
    const res = await loader({ request: new Request('https://admin.test/internal') } as never);
    const body = await res.json();
    expect(body.counts.unreadReplies).toBe(0);
    expect(supportTicketEventFindManyMock).not.toHaveBeenCalled();
  });
});

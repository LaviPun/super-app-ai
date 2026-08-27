import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task 8 (WS-G): notifySupportEvent('triage_failed', ...) fires an OpsAlertService
 * TRIAGE_FAILED alert in addition to its existing admin email — scoped to
 * triage_failed only ('escalated'/'intervention_flagged' are ticket-routing
 * signals, not infrastructure failures, per Decision G1's "ops alert" scope).
 */

const appSettingsFindUniqueMock = vi.fn();
const shopFindUniqueMock = vi.fn();
const sendEmailMock = vi.fn(async () => ({ sent: true }));
const recordTicketEventMock = vi.fn(async () => {});
const activityLogMock = vi.fn(async () => ({}));
const fireMock = vi.fn(async () => ({ sentry: true, email: false, slack: false }));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSettings: { findUnique: appSettingsFindUniqueMock },
    shop: { findUnique: shopFindUniqueMock },
  }),
}));

vi.mock('~/services/notifications/mailer.server', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('~/services/support/ticket-events.server', () => ({
  recordTicketEvent: recordTicketEventMock,
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = activityLogMock;
  },
}));

vi.mock('~/services/observability/ops-alert.server', () => ({
  OpsAlertService: class {
    fire = fireMock;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  appSettingsFindUniqueMock.mockResolvedValue({ enableEmailAlerts: true, alertRecipients: 'ops@example.com' });
  sendEmailMock.mockResolvedValue({ sent: true });
});

describe('notifySupportEvent(triage_failed) → OpsAlertService', () => {
  it('fires a TRIAGE_FAILED ops alert with the ticket id in context', async () => {
    const { notifySupportEvent } = await import('~/services/support/notifications.server');
    await notifySupportEvent(
      'triage_failed',
      { id: 'ticket_1', subject: 'help', shopId: null },
      { shopDomain: 'x.myshopify.com', reason: 'model down' },
    );

    expect(fireMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'TRIAGE_FAILED',
        context: expect.objectContaining({ ticketId: 'ticket_1', shopDomain: 'x.myshopify.com' }),
      }),
    );
  });

  it('does NOT fire an ops alert for "escalated" (routing signal, not infra failure)', async () => {
    const { notifySupportEvent } = await import('~/services/support/notifications.server');
    await notifySupportEvent('escalated', { id: 'ticket_2', subject: 'help', shopId: null }, {});

    expect(fireMock).not.toHaveBeenCalled();
  });

  it('does NOT fire an ops alert for "intervention_flagged"', async () => {
    const { notifySupportEvent } = await import('~/services/support/notifications.server');
    await notifySupportEvent('intervention_flagged', { id: 'ticket_3', subject: 'help', shopId: null }, {});

    expect(fireMock).not.toHaveBeenCalled();
  });
});

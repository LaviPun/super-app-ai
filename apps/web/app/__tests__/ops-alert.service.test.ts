import { beforeEach, describe, expect, it, vi } from 'vitest';

export function mockAppSettings(overrides: Record<string, unknown> = {}) {
  return {
    enableEmailAlerts: true,
    alertRecipients: 'ops@example.com',
    opsSlackWebhookUrlEnc: null,
    opsAlertThresholdCount: 3,
    opsAlertThresholdWindowMin: 15,
    ...overrides,
  };
}

vi.mock('~/services/observability/sentry.server', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('~/services/notifications/mailer.server', () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));

const appSettingsRow: Record<string, unknown> = {
  enableEmailAlerts: true,
  alertRecipients: 'ops@example.com',
  opsSlackWebhookUrlEnc: null,
  opsAlertThresholdCount: 3,
  opsAlertThresholdWindowMin: 15,
};
// getPrisma() is a real singleton (see db.server.ts) — the mock must return the
// SAME object (and the same vi.fn() instances) across calls, otherwise a test's
// `getPrisma().activityLog.count.mockResolvedValue(...)` sets an override on a
// throwaway object the service under test never sees.
vi.mock('~/db.server', () => {
  let client: unknown;
  return {
    getPrisma: () => {
      if (!client) {
        client = {
          appSettings: { findUnique: vi.fn(async () => appSettingsRow) },
          activityLog: {
            create: vi.fn(async () => ({})),
            count: vi.fn(async () => 0), // rolling-window failure count for this kind; tests override per-case
          },
        };
      }
      return client;
    },
  };
});

import { captureException } from '~/services/observability/sentry.server';
import { sendEmail } from '~/services/notifications/mailer.server';
import { getPrisma } from '~/db.server';
import { OpsAlertService } from '~/services/observability/ops-alert.server';

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks resets call history but NOT a mock's implementation — restore
  // the module-level default behavior here so a mockRejectedValue/mockImplementation
  // set by one test's error-path assertion doesn't leak into the next test.
  (captureException as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ sent: true });
  (getPrisma().activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
});

describe('OpsAlertService.fire', () => {
  it('always calls Sentry captureException when an error is present, regardless of threshold', async () => {
    const svc = new OpsAlertService({ sendSlack: vi.fn(async () => ({ sent: true })) });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'job x failed', error: new Error('boom') });
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({}));
    expect(result.sentry).toBe(true);
  });

  it('does not email/Slack below the rolling-window threshold', async () => {
    const { getPrisma } = await import('~/db.server');
    (getPrisma().activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(1); // below default threshold 3
    const slack = vi.fn(async () => ({ sent: true }));
    const svc = new OpsAlertService({ sendSlack: slack });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'job x failed' });
    expect(result.email).toBe(false);
    expect(result.slack).toBe(false);
    expect(slack).not.toHaveBeenCalled();
  });

  it('emails once the threshold is crossed within the window', async () => {
    const { getPrisma } = await import('~/db.server');
    (getPrisma().activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(3); // at threshold
    const { sendEmail } = await import('~/services/notifications/mailer.server');
    const svc = new OpsAlertService({ sendSlack: vi.fn(async () => ({ sent: true })) });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'job x failed' });
    expect(sendEmail).toHaveBeenCalled();
    expect(result.email).toBe(true);
  });

  it('never throws even when Sentry/email/Slack all reject', async () => {
    (captureException as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('sentry down');
    });
    const { getPrisma } = await import('~/db.server');
    (getPrisma().activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    const { sendEmail } = await import('~/services/notifications/mailer.server');
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('smtp down'));
    const slack = vi.fn(async () => {
      throw new Error('slack down');
    });
    const svc = new OpsAlertService({ sendSlack: slack });
    await expect(svc.fire({ kind: 'JOB_FAILED', message: 'x' })).resolves.toBeDefined();
  });

  it('channels degrade independently — a Slack failure does not block email', async () => {
    const { getPrisma } = await import('~/db.server');
    (getPrisma().activityLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    const { sendEmail } = await import('~/services/notifications/mailer.server');
    const slack = vi.fn(async () => {
      throw new Error('slack down');
    });
    const svc = new OpsAlertService({ sendSlack: slack });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'x' });
    expect(result.email).toBe(true);
    expect(result.slack).toBe(false);
  });
});

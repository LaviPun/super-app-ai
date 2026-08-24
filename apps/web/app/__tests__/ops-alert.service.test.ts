import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
// Real AES-GCM roundtrip needs ENCRYPTION_KEY, which vitest's Node env does not
// load from .env — fake the encrypt/decrypt shape instead; correctness of the
// real crypto is covered by crypto.server's own tests, not this file's concern.
vi.mock('~/services/security/crypto.server', () => ({
  encryptJson: (value: unknown) => JSON.stringify(value),
  decryptJson: (ciphertext: string) => JSON.parse(ciphertext),
}));

// getPrisma() is a real singleton (see db.server.ts) that reads/writes a real
// table — the mock models that with a shared, PERSISTED in-memory store (create()
// appends, count() actually filters by action/createdAt/details), rather than a
// canned per-test return value. This is what caught the Fix-round-1 bug: a
// pre-seeded `count()` return can't reveal a bootstrap deadlock where the counted
// row type is only ever written *after* the gate it's supposed to open.
//
// NOTE: the default settings literal is duplicated here (matching
// mockAppSettings()'s shape) rather than referencing the outer `mockAppSettings()`
// export — vi.mock factories run before any of the file's own top-level `const`
// initializers, so touching an outer const directly in the factory body (as
// opposed to inside a lazily-invoked closure) throws a TDZ ReferenceError.
type ActivityRow = { action: string; details: string | null; createdAt: Date };
vi.mock('~/db.server', () => {
  const defaultAppSettings = {
    enableEmailAlerts: true,
    alertRecipients: 'ops@example.com',
    opsSlackWebhookUrlEnc: null as string | null,
    opsAlertThresholdCount: 3,
    opsAlertThresholdWindowMin: 15,
  };
  const state: { rows: ActivityRow[]; appSettings: Record<string, unknown> } = {
    rows: [],
    appSettings: { ...defaultAppSettings },
  };
  return {
    getPrisma: () => ({
      appSettings: { findUnique: vi.fn(async () => state.appSettings) },
      activityLog: {
        create: vi.fn(async ({ data }: { data: { action: string; details?: string | null } }) => {
          const row: ActivityRow = { action: data.action, details: data.details ?? null, createdAt: new Date() };
          state.rows.push(row);
          return row;
        }),
        count: vi.fn(
          async ({
            where,
          }: {
            where: { action?: string; createdAt?: { gte: Date }; details?: { contains: string } };
          }) => {
            return state.rows.filter((r) => {
              if (where.action && r.action !== where.action) return false;
              if (where.createdAt?.gte && r.createdAt.getTime() < where.createdAt.gte.getTime()) return false;
              if (where.details?.contains && !(r.details ?? '').includes(where.details.contains)) return false;
              return true;
            }).length;
          },
        ),
      },
    }),
    // Test-only escape hatch: reset the persisted store between tests, optionally
    // overriding AppSettings fields (e.g. opsSlackWebhookUrlEnc for the Slack test).
    __resetOpsAlertTestStore: (overrides: Record<string, unknown> = {}) => {
      state.rows.length = 0;
      state.appSettings = { ...defaultAppSettings, ...overrides };
    },
  };
});

import { captureException } from '~/services/observability/sentry.server';
import { sendEmail } from '~/services/notifications/mailer.server';
import { encryptJson } from '~/services/security/crypto.server';
import { OpsAlertService } from '~/services/observability/ops-alert.server';

async function resetStore(overrides: Record<string, unknown> = {}) {
  const db = (await import('~/db.server')) as unknown as {
    __resetOpsAlertTestStore: (overrides?: Record<string, unknown>) => void;
  };
  db.__resetOpsAlertTestStore(overrides);
}

beforeEach(async () => {
  vi.clearAllMocks();
  // clearAllMocks resets call history but NOT a mock's implementation — restore
  // the module-level default behavior here so a mockRejectedValue/mockImplementation
  // set by one test's error-path assertion doesn't leak into the next test.
  (captureException as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ sent: true });
  await resetStore();
});

describe('OpsAlertService.fire', () => {
  it('always calls Sentry captureException when an error is present, regardless of threshold', async () => {
    const svc = new OpsAlertService({ sendSlack: vi.fn(async () => ({ sent: true })) });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'job x failed', error: new Error('boom') });
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({}));
    expect(result.sentry).toBe(true);
    // Single occurrence, default threshold 3 — not enough to fire yet.
    expect(result.email).toBe(false);
  });

  it('does not email/Slack below the rolling-window threshold', async () => {
    const slack = vi.fn(async () => ({ sent: true }));
    const svc = new OpsAlertService({ sendSlack: slack });
    await svc.fire({ kind: 'JOB_FAILED', message: 'occurrence 1' });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'occurrence 2' }); // 2 of 3
    expect(result.email).toBe(false);
    expect(result.slack).toBe(false);
    expect(slack).not.toHaveBeenCalled();
  });

  it('emails once the threshold is crossed within the window', async () => {
    const svc = new OpsAlertService({ sendSlack: vi.fn(async () => ({ sent: true })) });
    await svc.fire({ kind: 'JOB_FAILED', message: 'occurrence 1' });
    await svc.fire({ kind: 'JOB_FAILED', message: 'occurrence 2' });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: 'occurrence 3' }); // crosses threshold 3
    expect(sendEmail).toHaveBeenCalled();
    expect(result.email).toBe(true);
  });

  it('never throws even when Sentry/email/Slack all reject', async () => {
    (captureException as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('sentry down');
    });
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('smtp down'));
    const slack = vi.fn(async () => {
      throw new Error('slack down');
    });
    const svc = new OpsAlertService({ sendSlack: slack });
    await svc.fire({ kind: 'JOB_FAILED', message: '1' });
    await svc.fire({ kind: 'JOB_FAILED', message: '2' });
    await expect(svc.fire({ kind: 'JOB_FAILED', message: '3' })).resolves.toBeDefined(); // crosses threshold
  });

  it('channels degrade independently — a Slack failure does not block email', async () => {
    // Adjustment vs. the original snippet: give the store a real (fake-crypto)
    // Slack webhook so trySlack actually calls the injected sender instead of
    // short-circuiting on `webhookUrlEnc == null` — otherwise this assertion
    // passes trivially without ever exercising the injected failure.
    await resetStore({ opsSlackWebhookUrlEnc: encryptJson({ url: 'https://hooks.slack.com/services/x/y/z' }) });
    const slack = vi.fn(async () => {
      throw new Error('slack down');
    });
    const svc = new OpsAlertService({ sendSlack: slack });
    await svc.fire({ kind: 'JOB_FAILED', message: '1' });
    await svc.fire({ kind: 'JOB_FAILED', message: '2' });
    const result = await svc.fire({ kind: 'JOB_FAILED', message: '3' }); // crosses threshold
    expect(slack).toHaveBeenCalled();
    expect(result.email).toBe(true);
    expect(result.slack).toBe(false);
  });
});

describe('OpsAlertService.fire — occurrence-counting round trip (threshold + cooldown + window expiry)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once on threshold crossing, suppresses a repeat within the window via cooldown, then fires again once the window has elapsed', async () => {
    const svc = new OpsAlertService({ sendSlack: vi.fn(async () => ({ sent: true })) });

    // (a) below threshold: two occurrences (threshold is 3) — Sentry fires, email does not.
    const r1 = await svc.fire({ kind: 'TRIAGE_FAILED', message: 'attempt 1', error: new Error('e1') });
    expect(r1.sentry).toBe(true);
    expect(r1.email).toBe(false);
    const r2 = await svc.fire({ kind: 'TRIAGE_FAILED', message: 'attempt 2', error: new Error('e2') });
    expect(r2.email).toBe(false);

    // (b) the 3rd occurrence crosses the threshold and fires email.
    const r3 = await svc.fire({ kind: 'TRIAGE_FAILED', message: 'attempt 3', error: new Error('e3') });
    expect(r3.email).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    // (c) a minute later, still inside the 15-minute window: overThreshold stays
    // true (occurrences keep accumulating) but the OPS_ALERT_FIRED cooldown
    // suppresses a repeat send — no spam.
    vi.setSystemTime(new Date('2026-08-24T00:01:00.000Z'));
    const r4 = await svc.fire({ kind: 'TRIAGE_FAILED', message: 'attempt 4', error: new Error('e4') });
    expect(r4.email).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    // (d) 20+ minutes later — the 15-minute window has fully elapsed, so the
    // earlier occurrences AND the earlier OPS_ALERT_FIRED cooldown row both age
    // out. A fresh run of occurrences crosses the threshold again and fires.
    vi.setSystemTime(new Date('2026-08-24T00:20:00.000Z'));
    const r5 = await svc.fire({ kind: 'TRIAGE_FAILED', message: 'attempt 5', error: new Error('e5') });
    expect(r5.email).toBe(false); // only 1 occurrence in the new window so far
    vi.setSystemTime(new Date('2026-08-24T00:21:00.000Z'));
    const r6 = await svc.fire({ kind: 'TRIAGE_FAILED', message: 'attempt 6', error: new Error('e6') });
    expect(r6.email).toBe(false); // 2 of 3
    vi.setSystemTime(new Date('2026-08-24T00:22:00.000Z'));
    const r7 = await svc.fire({ kind: 'TRIAGE_FAILED', message: 'attempt 7', error: new Error('e7') });
    expect(r7.email).toBe(true); // 3 of 3 — fires again
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

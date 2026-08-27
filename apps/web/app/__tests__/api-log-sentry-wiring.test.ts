import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('~/db.server', () => ({ getPrisma: () => ({
  apiLog: { create: vi.fn(async () => ({ id: '1' })), update: vi.fn(async () => ({})) },
})}));
const errLogWriteMock = vi.fn(async () => {});
vi.mock('~/services/observability/error-log.service', () => ({ ErrorLogService: class { write = errLogWriteMock; } }));
const fireMock = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
// Fix round 2: reimplement markOpsAlerted/wasOpsAlerted with the same
// `__opsAlerted` convention as the real module (mirrors
// webhook-fanout-alert-wiring.test.ts's "fix round 1" pattern) rather than
// pulling in the real module via importOriginal, which would transitively
// import ~/db.server.
vi.mock('~/services/observability/ops-alert.server', () => ({
  OpsAlertService: class {
    fire = fireMock;
  },
  markOpsAlerted: (error: unknown) => {
    if (error && typeof error === 'object') (error as { __opsAlerted?: boolean }).__opsAlerted = true;
  },
  wasOpsAlerted: (error: unknown) =>
    !!(error && typeof error === 'object' && (error as { __opsAlerted?: boolean }).__opsAlerted === true),
}));

import { withApiLogging } from '~/services/observability/api-log.service';
import { markOpsAlerted } from '~/services/observability/ops-alert.server';
import { AppError } from '~/services/errors/app-error.server';

beforeEach(() => vi.clearAllMocks());

describe('withApiLogging → OpsAlertService wiring', () => {
  it('calls OpsAlertService.fire with kind API_REQUEST_FAILED before re-throwing', async () => {
    const err = new Error('handler exploded');
    await expect(
      withApiLogging({ actor: 'MERCHANT', method: 'POST', path: '/api/x' }, async () => { throw err; }),
    ).rejects.toThrow('handler exploded');
    expect(fireMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'API_REQUEST_FAILED', error: err }));
    expect(errLogWriteMock).toHaveBeenCalled();
  });

  it('does NOT call fire on a successful response', async () => {
    await withApiLogging({ actor: 'MERCHANT', method: 'GET', path: '/api/x' }, async () => new Response('ok', { status: 200 }));
    expect(fireMock).not.toHaveBeenCalled();
  });

  describe('double-alert seam (fix round 2)', () => {
    it('a rethrow-after-fail route path fires exactly ONE alert — skips the second fire when the error was already marked', async () => {
      // Simulates JobService.fail having already fired JOB_FAILED for this
      // exact error and marked it, then the route awaiting that job inline
      // rethrows the same error object into withApiLogging.
      const err = new Error('job failed upstream');
      markOpsAlerted(err);

      await expect(
        withApiLogging({ actor: 'MERCHANT', method: 'POST', path: '/api/x' }, async () => { throw err; }),
      ).rejects.toThrow('job failed upstream');

      expect(fireMock).not.toHaveBeenCalled();
      // ErrorLog write and the rethrow itself are untouched by the seam.
      expect(errLogWriteMock).toHaveBeenCalled();
    });

    it('an unmarked error still fires normally (the gate only suppresses already-alerted errors)', async () => {
      const err = new Error('fresh failure, never alerted');
      await expect(
        withApiLogging({ actor: 'MERCHANT', method: 'POST', path: '/api/x' }, async () => { throw err; }),
      ).rejects.toThrow('fresh failure, never alerted');
      expect(fireMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('4xx client errors are not pager-grade (fix round 2)', () => {
    it('an AppError with a 4xx status (RATE_LIMITED) does not fire an ops alert', async () => {
      const err = new AppError({ code: 'RATE_LIMITED', message: 'slow down' });
      expect(err.status).toBe(429);

      await expect(
        withApiLogging({ actor: 'MERCHANT', method: 'POST', path: '/api/x' }, async () => { throw err; }),
      ).rejects.toThrow('slow down');

      expect(fireMock).not.toHaveBeenCalled();
      // ErrorLog write stays unconditional even for expected 4xx outcomes.
      expect(errLogWriteMock).toHaveBeenCalled();
    });

    it('an AppError with a 5xx status still fires', async () => {
      const err = new AppError({ code: 'PUBLISH_ERROR', message: 'publish blew up' });
      expect(err.status).toBe(500);

      await expect(
        withApiLogging({ actor: 'MERCHANT', method: 'POST', path: '/api/x' }, async () => { throw err; }),
      ).rejects.toThrow('publish blew up');

      expect(fireMock).toHaveBeenCalledTimes(1);
    });

    it('a generic (non-AppError) Error still fires unconditionally', async () => {
      const err = new Error('unexpected crash');
      await expect(
        withApiLogging({ actor: 'MERCHANT', method: 'POST', path: '/api/x' }, async () => { throw err; }),
      ).rejects.toThrow('unexpected crash');
      expect(fireMock).toHaveBeenCalledTimes(1);
    });
  });
});

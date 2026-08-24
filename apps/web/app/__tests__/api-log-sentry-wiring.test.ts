import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('~/db.server', () => ({ getPrisma: () => ({
  apiLog: { create: vi.fn(async () => ({ id: '1' })), update: vi.fn(async () => ({})) },
})}));
vi.mock('~/services/observability/error-log.service', () => ({ ErrorLogService: class { async write() {} } }));
const fireMock = vi.fn(async () => ({ sentry: true, email: false, slack: false }));
vi.mock('~/services/observability/ops-alert.server', () => ({ OpsAlertService: class { fire = fireMock; } }));

import { withApiLogging } from '~/services/observability/api-log.service';

beforeEach(() => vi.clearAllMocks());

describe('withApiLogging → OpsAlertService wiring', () => {
  it('calls OpsAlertService.fire with kind API_REQUEST_FAILED before re-throwing', async () => {
    const err = new Error('handler exploded');
    await expect(
      withApiLogging({ actor: 'MERCHANT', method: 'POST', path: '/api/x' }, async () => { throw err; }),
    ).rejects.toThrow('handler exploded');
    expect(fireMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'API_REQUEST_FAILED', error: err }));
  });

  it('does NOT call fire on a successful response', async () => {
    await withApiLogging({ actor: 'MERCHANT', method: 'GET', path: '/api/x' }, async () => new Response('ok', { status: 200 }));
    expect(fireMock).not.toHaveBeenCalled();
  });
});

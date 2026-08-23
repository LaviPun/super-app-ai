import { describe, it, expect, vi } from 'vitest';
import { commitPendingDeletes } from '~/utils/pending-delete';

describe('commitPendingDeletes', () => {
  it('fires one keepalive POST per pending module id', () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    commitPendingDeletes(['m1', 'm2'], fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/modules/m1/delete',
      expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'same-origin' }),
    );
    expect(fetchImpl).toHaveBeenCalledWith('/api/modules/m2/delete', expect.anything());
  });

  it('swallows rejections (unmount path must never throw)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network gone');
    });
    expect(() => commitPendingDeletes(['m1'], fetchImpl as unknown as typeof fetch)).not.toThrow();
    // Let the rejected promise settle; an unhandled rejection would fail the run.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('no-ops on an empty id list', () => {
    const fetchImpl = vi.fn();
    commitPendingDeletes([], fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

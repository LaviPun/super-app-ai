import { describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
}));

import { randomUUID } from 'node:crypto';
import { extractWebhookEventId } from '~/services/flows/idempotency.server';

describe('extractWebhookEventId', () => {
  it('uses X-Shopify-Webhook-Id when present', () => {
    const req = new Request('http://localhost/webhooks', {
      headers: { 'x-shopify-webhook-id': 'wh_123' },
    });
    expect(extractWebhookEventId(req)).toBe('wh_123');
  });

  it('falls back to randomUUID when header is missing', () => {
    (randomUUID as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce('uuid-1');
    const req = new Request('http://localhost/webhooks');
    expect(extractWebhookEventId(req)).toBe('uuid-1');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
});


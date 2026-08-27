import { describe, expect, it, vi } from 'vitest';
import { sendSlackAlert } from '~/services/observability/ops-alert-slack.server';

describe('sendSlackAlert', () => {
  it('posts { text } to the webhook URL and reports sent:true on 200', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendSlackAlert('https://hooks.slack.com/services/x/y/z', 'hello');
    expect(result.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/x/y/z',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'hello' }) }),
    );
    vi.unstubAllGlobals();
  });

  it('reports sent:false with the status on a non-2xx response, never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid_payload', { status: 400 })));
    const result = await sendSlackAlert('https://hooks.slack.com/services/x/y/z', 'hello');
    expect(result.sent).toBe(false);
    expect(result.error).toMatch(/400/);
    vi.unstubAllGlobals();
  });

  it('reports sent:false on a network error, never throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const result = await sendSlackAlert('https://hooks.slack.com/services/x/y/z', 'hello');
    expect(result.sent).toBe(false);
    vi.unstubAllGlobals();
  });
});

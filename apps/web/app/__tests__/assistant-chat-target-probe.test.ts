import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isChatEndpointStatus,
  isChatHandshakeStatus,
  probeTargetLiveness,
  validateAssistantChatTarget,
} from '~/services/ai/assistant-chat-target-probe.server';

describe('assistant-chat-target-probe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isChatEndpointStatus accepts typical chat handshake statuses', () => {
    expect(isChatEndpointStatus(200)).toBe(true);
    expect(isChatEndpointStatus(422)).toBe(true);
    expect(isChatEndpointStatus(404)).toBe(false);
  });

  it('isChatHandshakeStatus accepts upstream-unreachable responses', () => {
    expect(isChatHandshakeStatus(502)).toBe(true);
    expect(isChatHandshakeStatus(503)).toBe(true);
    expect(isChatHandshakeStatus(404)).toBe(false);
  });

  it('validates qwen3 target when first OpenAI-style probe returns 502 (router alive, upstream down)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/chat/completions')) {
        return new Response(JSON.stringify({ error: 'Upstream unreachable' }), { status: 502 });
      }
      return new Response('no', { status: 404 });
    });
    const result = await validateAssistantChatTarget({
      target: 'localMachine',
      backend: 'qwen3',
      url: 'http://127.0.0.1:8787',
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('502');
    expect(result.message).toContain('OpenAI-style');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('validates Ollama target when /api/tags returns 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await validateAssistantChatTarget({
      target: 'localMachine',
      backend: 'ollama',
      url: 'http://127.0.0.1:11434',
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('/api/tags');
  });

  it('accepts OpenAI-compatible host when second candidate returns 422', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/chat/completions')) {
        return new Response('{}', { status: 404 });
      }
      if (url.includes('/chat/completions')) {
        return new Response('{}', { status: 422 });
      }
      return new Response('no', { status: 404 });
    });
    const result = await validateAssistantChatTarget({
      target: 'modalRemote',
      backend: 'openai',
      url: 'https://example.com',
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    expect(result.message).toContain('/chat/completions');
  });

  it('probeTargetLiveness uses /api/tags for Ollama backend', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await probeTargetLiveness({
      backend: 'ollama',
      url: 'http://127.0.0.1:11434',
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toContain('/api/tags');
  });

  it('probeTargetLiveness uses /healthz for non-Ollama backends', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    );
    const result = await probeTargetLiveness({
      backend: 'qwen3',
      url: 'http://127.0.0.1:8787',
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toContain('/healthz');
  });

  it('detects router-only URL when chat paths fail but /route succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/route')) {
        return new Response('{}', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    const result = await validateAssistantChatTarget({
      target: 'modalRemote',
      backend: 'openai',
      // Use a resolvable public host so assertSafeTargetUrl (DNS + IP class checks) passes before fetch runs.
      url: 'https://example.com',
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain('router-only');
  });
});

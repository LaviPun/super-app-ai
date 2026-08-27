import { describe, expect, it, vi } from 'vitest';
import { testProviderConnection } from '~/services/internal/provider-connection-test.server';

describe('testProviderConnection', () => {
  it('refuses with a real error when no API key is configured, without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await testProviderConnection({ provider: 'OPENAI', baseUrl: null, apiKey: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no api key/i);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('OPENAI-compatible kind GETs {baseUrl}/models with a Bearer key and reports ok on 200', async () => {
    const fetchMock = vi.fn(async () => new Response('{"data":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await testProviderConnection({ provider: 'OPENAI', baseUrl: null, apiKey: 'sk-live' });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/models',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk-live' }) }),
    );
    vi.unstubAllGlobals();
  });

  it.each(['GROK', 'DEEPSEEK', 'MISTRAL', 'CUSTOM', 'AZURE_OPENAI'] as const)(
    '%s (OpenAI-compatible) hits its stored baseUrl, not the OpenAI default',
    async (kind) => {
      const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const result = await testProviderConnection({ provider: kind, baseUrl: 'https://example.test/v1/', apiKey: 'k' });
      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith('https://example.test/v1/models', expect.anything());
      vi.unstubAllGlobals();
    },
  );

  it('ANTHROPIC GETs {baseUrl}/v1/models with x-api-key + anthropic-version headers', async () => {
    const fetchMock = vi.fn(async () => new Response('{"data":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await testProviderConnection({ provider: 'ANTHROPIC', baseUrl: null, apiKey: 'sk-ant' });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({ headers: { 'x-api-key': 'sk-ant', 'anthropic-version': '2023-06-01' } }),
    );
    vi.unstubAllGlobals();
  });

  it('GEMINI GETs {baseUrl}/v1beta/models with x-goog-api-key header, never a ?key= query param', async () => {
    const fetchMock = vi.fn(async () => new Response('{"models":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await testProviderConnection({ provider: 'GEMINI', baseUrl: null, apiKey: 'AIza-key' });
    expect(result.ok).toBe(true);
    // Not a query param: Sentry's fetch-breadcrumb instrumentation records full
    // URLs and beforeSend does not redact breadcrumbs, so a key in the query
    // string would leak. Matches the gemini.client.server.ts precedent.
    // The exact-match URL (no query string) plus the header assertion together
    // prove the key is never appended as a query param.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models',
      expect.objectContaining({ headers: { 'x-goog-api-key': 'AIza-key' } }),
    );
    vi.unstubAllGlobals();
  });

  it('surfaces the real upstream error on a 401, never a generic message', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":{"message":"invalid_api_key"}}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await testProviderConnection({ provider: 'OPENAI', baseUrl: null, apiKey: 'bad-key' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
    expect(result.error).toMatch(/invalid_api_key/);
    vi.unstubAllGlobals();
  });

  it('reports ok:false (never throws) on a network error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await testProviderConnection({ provider: 'ANTHROPIC', baseUrl: null, apiKey: 'k' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
    vi.unstubAllGlobals();
  });
});

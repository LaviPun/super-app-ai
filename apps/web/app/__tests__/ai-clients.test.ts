import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openAiGenerateRecipe } from '~/services/ai/clients/openai-responses.client.server';
import { anthropicGenerateRecipe } from '~/services/ai/clients/anthropic-messages.client.server';
import { openAiCompatibleGenerateRecipe } from '~/services/ai/clients/openai-compatible.client.server';

function mockFetchOnce(status: number, jsonObj: any, headers: Record<string, string> = {}) {
  const text = JSON.stringify(jsonObj);
  (globalThis as any).fetch = vi.fn(async () => ({
    status,
    headers: new Map(Object.entries(headers)),
    text: async () => text,
  })) as any;
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.NODE_ENV = 'test';
});

describe('OpenAI Responses client', () => {
  it('extracts output_text and usage', async () => {
    mockFetchOnce(200, {
      model: 'gpt-5-mini',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '{"type":"theme.banner","name":"X","config":{"heading":"Hi","enableAnimation":false}}' }]
      }],
      usage: { input_tokens: 10, output_tokens: 20 }
    }, { 'x-request-id': 'req_123' });

    const r = await openAiGenerateRecipe({ apiKey: 'k', model: 'gpt-5-mini', prompt: 'make banner' });
    expect(r.rawJson).toContain('theme.banner');
    expect(r.tokensIn).toBe(10);
    expect(r.tokensOut).toBe(20);
  });
});

describe('Anthropic Messages client', () => {
  it('extracts text and usage', async () => {
    mockFetchOnce(200, {
      model: 'claude-sonnet-4-6',
      content: [{ type: 'text', text: '{"type":"proxy.widget","name":"W","config":{"widgetId":"abc-123","title":"Hello","mode":"HTML"}}' }],
      usage: { input_tokens: 5, output_tokens: 9 }
    });

    const r = await anthropicGenerateRecipe({ apiKey: 'k', model: 'claude-sonnet-4-6', prompt: 'make widget' });
    expect(r.rawJson).toContain('proxy.widget');
    expect(r.tokensIn).toBe(5);
    expect(r.tokensOut).toBe(9);
  });
});

describe('OpenAI-compatible client', () => {
  it('uses responses endpoint if available', async () => {
    mockFetchOnce(200, {
      model: 'x',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"type":"theme.banner","name":"X","config":{"heading":"Hi","enableAnimation":false}}' }] }],
      usage: { input_tokens: 1, output_tokens: 2 }
    });

    const r = await openAiCompatibleGenerateRecipe({ apiKey: 'k', baseUrl: 'https://example.com', model: 'x', prompt: 'p' });
    expect(r.tokensOut).toBe(2);
  });

  it('falls back to chat completions when responses fails', async () => {
    // First call fails
    (globalThis as any).fetch = vi.fn()
      .mockImplementationOnce(async () => ({ status: 404, headers: new Map(), text: async () => 'not found' }))
      .mockImplementationOnce(async () => ({ status: 200, headers: new Map(), text: async () => JSON.stringify({
        model: 'x',
        choices: [{ message: { content: '{"type":"proxy.widget","name":"W","config":{"widgetId":"abc-123","title":"Hello","mode":"HTML"}}' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4 }
      }) }));

    const r = await openAiCompatibleGenerateRecipe({ apiKey: 'k', baseUrl: 'https://example.com', model: 'x', prompt: 'p' });
    expect(r.tokensIn).toBe(3);
    expect(r.tokensOut).toBe(4);
  });
});

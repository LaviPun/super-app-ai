import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendInternalAssistantChat } from '~/services/ai/internal-assistant.server';

const { mockGetRouterRuntimeConfig, mockSelectToolsForPrompt, mockRunAssistantTool } = vi.hoisted(() => ({
  mockGetRouterRuntimeConfig: vi.fn(),
  mockSelectToolsForPrompt: vi.fn(),
  mockRunAssistantTool: vi.fn(),
}));

vi.mock('~/services/ai/router-runtime-config.server', () => ({
  getRouterRuntimeConfig: mockGetRouterRuntimeConfig,
}));

vi.mock('~/services/ai/internal-assistant-tools.server', () => ({
  selectToolsForPrompt: mockSelectToolsForPrompt,
  runAssistantTool: mockRunAssistantTool,
  formatToolContext: () => '',
}));

describe('sendInternalAssistantChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectToolsForPrompt.mockReturnValue([]);
    mockRunAssistantTool.mockResolvedValue({ toolName: 'getSystemHealth', ok: true, data: {} });
    vi.stubGlobal('fetch', vi.fn());
    mockGetRouterRuntimeConfig.mockResolvedValue({
      config: {
        dualTargetEnabled: true,
        activeTarget: 'localMachine',
        fallbackTarget: 'modalRemote',
        shadowMode: false,
        canaryShops: [],
        circuitFailureThreshold: 5,
        circuitCooldownMs: 30_000,
        releaseGateSchemaFailRateMax: 0.02,
        releaseGateFallbackRateMax: 0.05,
        targets: {
          localMachine: {
            url: 'http://127.0.0.1:11434',
            token: undefined,
            backend: 'ollama',
            model: 'qwen3:4b-instruct',
            timeoutMs: 3000,
          },
          modalRemote: {
            url: 'https://example.modal.run',
            token: 'token-123',
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
        },
      },
    });
  });

  it('uses openai-compatible endpoint for qwen3 target', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello from cloud qwen.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }), { status: 200 }));

    const result = await sendInternalAssistantChat({
      target: 'modalRemote',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.reply).toBe('Hello from cloud qwen.');
    expect(result.backend).toBe('qwen3');
    expect(fetch).toHaveBeenCalledWith(
      'https://example.modal.run/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses ollama endpoint for local target', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
        message: { content: 'Hello from local qwen.' },
        prompt_eval_count: 12,
        eval_count: 22,
    }), { status: 200 }));

    const result = await sendInternalAssistantChat({
      target: 'localMachine',
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(result.reply).toBe('Hello from local qwen.');
    expect(result.backend).toBe('ollama');
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('retries with available local model when configured model is missing', async () => {
    mockGetRouterRuntimeConfig.mockResolvedValueOnce({
      config: {
        dualTargetEnabled: false,
        activeTarget: 'localMachine',
        fallbackTarget: 'modalRemote',
        shadowMode: false,
        canaryShops: [],
        circuitFailureThreshold: 5,
        circuitCooldownMs: 30_000,
        releaseGateSchemaFailRateMax: 0.02,
        releaseGateFallbackRateMax: 0.05,
        targets: {
          localMachine: {
            url: 'http://127.0.0.1:11434',
            token: undefined,
            backend: 'ollama',
            model: 'qwen3:4b-instruct-q4_K_M',
            timeoutMs: 3000,
          },
          modalRemote: {
            url: undefined,
            token: undefined,
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
        },
      },
    });

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/chat')) {
        const bodyText = typeof init?.body === 'string' ? init.body : '';
        const body = JSON.parse(bodyText) as { model?: string };
        if (body.model === 'qwen3:4b-instruct-q4_K_M') {
          return new Response(JSON.stringify({ error: "model 'qwen3:4b-instruct-q4_K_M' not found" }), { status: 404 });
        }
        if (body.model === 'qwen3:4b-instruct') {
          return new Response(
            JSON.stringify({
              message: { content: 'Recovered with installed model.' },
              prompt_eval_count: 8,
              eval_count: 11,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
      }
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'qwen3:4b-instruct' }, { name: 'llama3.2:3b' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await sendInternalAssistantChat({
      target: 'localMachine',
      messages: [{ role: 'user', content: 'ping' }],
      allowFallback: false,
    });

    expect(result.reply).toBe('Recovered with installed model.');
    expect(result.model).toBe('qwen3:4b-instruct');
  });

  it('returns actionable missing-model error when no local alternative exists', async () => {
    mockGetRouterRuntimeConfig.mockResolvedValueOnce({
      config: {
        dualTargetEnabled: false,
        activeTarget: 'localMachine',
        fallbackTarget: 'modalRemote',
        shadowMode: false,
        canaryShops: [],
        circuitFailureThreshold: 5,
        circuitCooldownMs: 30_000,
        releaseGateSchemaFailRateMax: 0.02,
        releaseGateFallbackRateMax: 0.05,
        targets: {
          localMachine: {
            url: 'http://127.0.0.1:11434',
            token: undefined,
            backend: 'ollama',
            model: 'qwen3:4b-instruct-q4_K_M',
            timeoutMs: 3000,
          },
          modalRemote: {
            url: undefined,
            token: undefined,
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
        },
      },
    });

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/chat')) {
        return new Response(JSON.stringify({ error: "model 'qwen3:4b-instruct-q4_K_M' not found" }), { status: 404 });
      }
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'qwen3:4b-instruct-q4_K_M' }] }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(
      sendInternalAssistantChat({
        target: 'localMachine',
        messages: [{ role: 'user', content: 'ping' }],
        allowFallback: false,
      }),
    ).rejects.toThrow(/Pull it with: ollama pull qwen3:4b-instruct-q4_K_M/);
  });

  it('falls back to Ollama /api/chat when reference router returns 502 on OpenAI path (qwen3)', async () => {
    mockGetRouterRuntimeConfig.mockResolvedValueOnce({
      config: {
        dualTargetEnabled: false,
        activeTarget: 'localMachine',
        fallbackTarget: 'modalRemote',
        shadowMode: false,
        canaryShops: [],
        circuitFailureThreshold: 5,
        circuitCooldownMs: 30_000,
        releaseGateSchemaFailRateMax: 0.02,
        releaseGateFallbackRateMax: 0.05,
        targets: {
          localMachine: {
            url: 'http://127.0.0.1:8787',
            token: undefined,
            backend: 'qwen3',
            model: 'qwen3:4b-instruct-q4_K_M',
            timeoutMs: 3000,
          },
          modalRemote: {
            url: 'https://example.modal.run',
            token: 'token-123',
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
        },
      },
    });

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/chat/completions')) {
        return new Response(JSON.stringify({ error: 'Upstream unreachable' }), { status: 502 });
      }
      if (url.includes('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: { content: 'Hello via Ollama passthrough.' },
            prompt_eval_count: 3,
            eval_count: 5,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await sendInternalAssistantChat({
      target: 'localMachine',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.reply).toBe('Hello via Ollama passthrough.');
    expect(result.backend).toBe('ollama');
    expect(vi.mocked(fetch).mock.calls.map((c) => c[0]?.toString())).toEqual(
      expect.arrayContaining([
        'http://127.0.0.1:8787/v1/chat/completions',
        'http://127.0.0.1:8787/api/chat',
      ]),
    );
  });

  it('falls back to Ollama when reference router returns 503 on OpenAI path (qwen3)', async () => {
    mockGetRouterRuntimeConfig.mockResolvedValueOnce({
      config: {
        dualTargetEnabled: false,
        activeTarget: 'localMachine',
        fallbackTarget: 'modalRemote',
        shadowMode: false,
        canaryShops: [],
        circuitFailureThreshold: 5,
        circuitCooldownMs: 30_000,
        releaseGateSchemaFailRateMax: 0.02,
        releaseGateFallbackRateMax: 0.05,
        targets: {
          localMachine: {
            url: 'http://127.0.0.1:8787',
            token: undefined,
            backend: 'qwen3',
            model: 'qwen3:4b-instruct-q4_K_M',
            timeoutMs: 3000,
          },
          modalRemote: {
            url: 'https://example.modal.run',
            token: 'token-123',
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
        },
      },
    });

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/chat/completions')) {
        return new Response('bad gateway', { status: 503 });
      }
      if (url.includes('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: { content: 'Hello via Ollama after 503.' },
            prompt_eval_count: 1,
            eval_count: 2,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await sendInternalAssistantChat({
      target: 'localMachine',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.reply).toBe('Hello via Ollama after 503.');
    expect(result.backend).toBe('ollama');
  });

  it('falls back to Ollama on reference router when OpenAI path returns trivial 422', async () => {
    mockGetRouterRuntimeConfig.mockResolvedValueOnce({
      config: {
        dualTargetEnabled: false,
        activeTarget: 'localMachine',
        fallbackTarget: 'modalRemote',
        shadowMode: false,
        canaryShops: [],
        circuitFailureThreshold: 5,
        circuitCooldownMs: 30_000,
        releaseGateSchemaFailRateMax: 0.02,
        releaseGateFallbackRateMax: 0.05,
        targets: {
          localMachine: {
            url: 'http://localhost:8787',
            token: undefined,
            backend: 'openai',
            model: 'qwen3:4b-instruct-q4_K_M',
            timeoutMs: 3000,
          },
          modalRemote: {
            url: 'https://example.modal.run',
            token: 'token-123',
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
        },
      },
    });

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/chat/completions')) {
        return new Response('{}', { status: 422 });
      }
      if (url.includes('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: { content: 'Hello after 422.' },
            prompt_eval_count: 1,
            eval_count: 2,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await sendInternalAssistantChat({
      target: 'localMachine',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.reply).toBe('Hello after 422.');
    expect(result.backend).toBe('ollama');
  });

  it('does not fall back to Ollama for Modal URL on 502', async () => {
    mockGetRouterRuntimeConfig.mockResolvedValueOnce({
      config: {
        dualTargetEnabled: false,
        activeTarget: 'localMachine',
        fallbackTarget: 'modalRemote',
        shadowMode: false,
        canaryShops: [],
        circuitFailureThreshold: 5,
        circuitCooldownMs: 30_000,
        releaseGateSchemaFailRateMax: 0.02,
        releaseGateFallbackRateMax: 0.05,
        targets: {
          localMachine: {
            url: 'https://example.modal.run',
            token: 'tok',
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
          modalRemote: {
            url: 'https://example.modal.run',
            token: 'tok',
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
        },
      },
    });

    vi.mocked(fetch).mockResolvedValue(new Response('upstream', { status: 502 }));

    await expect(
      sendInternalAssistantChat({
        target: 'localMachine',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/502/);
    const urls = vi.mocked(fetch).mock.calls.map((c) => {
      const i = c[0];
      if (typeof i === 'string') return i;
      if (i instanceof URL) return i.href;
      if (i instanceof Request) return i.url;
      return String(i);
    });
    expect(urls.every((u) => !u.includes('/api/chat'))).toBe(true);
  });

  it('rejects modalRemote when INTERNAL_AI_LOCAL_ONLY is enabled', async () => {
    vi.stubEnv('INTERNAL_AI_LOCAL_ONLY', '1');
    try {
      await expect(
        sendInternalAssistantChat({
          target: 'modalRemote',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      ).rejects.toThrow(/INTERNAL_AI_LOCAL_ONLY/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('fails when selected target URL is not configured', async () => {
    mockGetRouterRuntimeConfig.mockResolvedValueOnce({
      config: {
        dualTargetEnabled: true,
        activeTarget: 'localMachine',
        fallbackTarget: 'modalRemote',
        shadowMode: false,
        canaryShops: [],
        circuitFailureThreshold: 5,
        circuitCooldownMs: 30_000,
        releaseGateSchemaFailRateMax: 0.02,
        releaseGateFallbackRateMax: 0.05,
        targets: {
          localMachine: {
            url: undefined,
            token: undefined,
            backend: 'ollama',
            model: 'qwen3:4b-instruct',
            timeoutMs: 3000,
          },
          modalRemote: {
            url: undefined,
            token: undefined,
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
        },
      },
    });

    await expect(sendInternalAssistantChat({
      target: 'localMachine',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toThrow('not configured with a URL');
  });

  it('falls back to the secondary target when primary fetch throws', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.href : input.url;
      if (url.startsWith('http://127.0.0.1:11434')) {
        throw new Error('primary-down');
      }
      if (url.startsWith('https://example.modal.run')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'reply via fallback' } }],
            usage: { prompt_tokens: 7, completion_tokens: 9 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await sendInternalAssistantChat({
      target: 'localMachine',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.hadFallback).toBe(true);
    expect(result.target).toBe('modalRemote');
    expect(result.backend).toBe('qwen3');
    expect(result.model).toBe('Qwen/Qwen3-4B-Instruct');
    expect(result.reply).toBe('reply via fallback');
  });

  it('rejects when getRouterRuntimeConfig returns a parseError', async () => {
    mockGetRouterRuntimeConfig.mockResolvedValueOnce({
      config: {
        dualTargetEnabled: false,
        activeTarget: 'localMachine',
        fallbackTarget: 'modalRemote',
        shadowMode: false,
        canaryShops: [],
        circuitFailureThreshold: 5,
        circuitCooldownMs: 30_000,
        releaseGateSchemaFailRateMax: 0.02,
        releaseGateFallbackRateMax: 0.05,
        targets: {
          localMachine: {
            url: 'http://127.0.0.1:11434',
            token: undefined,
            backend: 'ollama',
            model: 'qwen3:4b-instruct',
            timeoutMs: 3000,
          },
          modalRemote: {
            url: undefined,
            token: undefined,
            backend: 'qwen3',
            model: 'Qwen/Qwen3-4B-Instruct',
            timeoutMs: 4000,
          },
        },
      },
      parseError: 'decryption-failed',
    });

    await expect(
      sendInternalAssistantChat({
        target: 'localMachine',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow(/Router runtime config unavailable/);
  });

  it('rethrows the primary error when both targets fail', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.href : input.url;
      if (url.startsWith('http://127.0.0.1:11434')) {
        throw new Error('primary-down');
      }
      if (url.startsWith('https://example.modal.run')) {
        throw new Error('fallback-down');
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(
      sendInternalAssistantChat({
        target: 'localMachine',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('primary-down');
  });
});

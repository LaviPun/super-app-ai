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

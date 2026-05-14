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
    });

    await expect(sendInternalAssistantChat({
      target: 'localMachine',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toThrow('not configured with a URL');
  });
});

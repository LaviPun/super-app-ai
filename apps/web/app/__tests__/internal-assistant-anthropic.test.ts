import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendInternalAssistantChat, streamInternalAssistantChat } from '~/services/ai/internal-assistant.server';

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

function anthropicConfig() {
  return {
    config: {
      dualTargetEnabled: true,
      activeTarget: 'modalRemote',
      fallbackTarget: 'localMachine',
      shadowMode: false,
      canaryShops: [],
      circuitFailureThreshold: 5,
      circuitCooldownMs: 30_000,
      releaseGateSchemaFailRateMax: 0.02,
      releaseGateFallbackRateMax: 0.05,
      targets: {
        localMachine: { url: undefined, backend: 'ollama', model: 'qwen3:4b-instruct', timeoutMs: 3000 },
        modalRemote: {
          url: 'https://api.anthropic.com',
          backend: 'anthropic',
          model: 'claude-sonnet-4-6',
          token: 'sk-ant-test',
          timeoutMs: 3000,
        },
      },
    },
  };
}

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

describe('anthropic assistant backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectToolsForPrompt.mockReturnValue([]);
    mockGetRouterRuntimeConfig.mockResolvedValue(anthropicConfig());
  });

  it('sends Messages API request with x-api-key and parses the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'All systems nominal.' }],
          usage: { input_tokens: 42, output_tokens: 7 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendInternalAssistantChat({
      target: 'modalRemote',
      messages: [{ role: 'user', content: 'status?' }],
      allowFallback: false,
    });

    expect(result.backend).toBe('anthropic');
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.reply).toBe('All systems nominal.');
    expect(result.tokensIn).toBe(42);
    expect(result.tokensOut).toBe(7);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(String(init.body)) as { system?: string; messages: Array<{ role: string }> };
    expect(body.system).toContain('internal operations copilot');
    expect(body.messages.every((m) => m.role !== 'system')).toBe(true);
  });

  it('streams content_block_delta tokens and usage', async () => {
    const frames = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(sseBody(frames), { status: 200 })),
    );

    const tokens: string[] = [];
    const generator = streamInternalAssistantChat({
      target: 'modalRemote',
      messages: [{ role: 'user', content: 'hi' }],
      allowFallback: false,
    });
    let result;
    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
      if (next.value.type === 'token') tokens.push(next.value.text);
    }

    expect(tokens.join('')).toBe('Hello');
    expect(result.reply).toBe('Hello');
    expect(result.tokensIn).toBe(12);
    expect(result.tokensOut).toBe(2);
    expect(result.backend).toBe('anthropic');
  });

  it('reports a clear error when no API key is configured', async () => {
    const config = anthropicConfig();
    config.config.targets.modalRemote.token = undefined as unknown as string;
    mockGetRouterRuntimeConfig.mockResolvedValue(config);
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        sendInternalAssistantChat({
          target: 'modalRemote',
          messages: [{ role: 'user', content: 'hi' }],
          allowFallback: false,
        }),
      ).rejects.toThrow(/Anthropic backend but no API key/);
    } finally {
      if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});
